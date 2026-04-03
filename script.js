// ================= CONFIG =================
const CONFIG_SHEET_URL = 'https://script.google.com/macros/s/AKfycbyfujc5A_qjCti6nH_AILuOJbPW7oIpAhC3zNeOXVpl01Jn0RL5X2T5a8tyXunmTtoj/exec'; 

// ================= DOM =================
const video = document.getElementById("video");
const canvasElement = document.getElementById("canvas");
const canvas = canvasElement.getContext("2d", { alpha: false, willReadFrequently: true });

// ================= DATA =================
const LEVELS = [
  { lv: 0, name: "ใส", color: "#ffffff", textColor: "#000" },
  { lv: 1, name: "เหลืองจาง", color: "#FEEFC6", textColor: "#000" },
  { lv: 2, name: "เหลือง", color: "#FDD771", textColor: "#000" },
  { lv: 3, name: "ส้ม/ขาดน้ำ", color: "#FFB300", textColor: "#000" },
  { lv: 4, name: "น้ำตาล/อันตราย", color: "#795548", textColor: "#fff" }
];

// ================= STATE =================
let state = "IDLE";
let currentNumber = "";
let currentName = "";
let currentBuble = "";
let currentLV = 0;
let historyData = JSON.parse(localStorage.getItem('urine_history_v2') || '[]');
let cameraStream = null;
let scanInterval = null;

// ================= INIT =================
document.addEventListener('DOMContentLoaded', () => {
  renderHistory();
  startClock();
  autoStartCamera(); // 🔥 เปิดกล้องอัตโนมัติ
});

// ================= AUTO CAMERA =================
async function autoStartCamera() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const hasCamera = devices.some(d => d.kind === 'videoinput');
    if (!hasCamera) return;

    await initCamera(); // 👉 เปิดเลย
  } catch (e) {
    console.log("Auto camera blocked:", e);
  }
}

// ================= CAMERA =================
async function initCamera() {
  try {
    const constraints = {
      video: {
        facingMode: "environment",
        width: { ideal: 720 },
        height: { ideal: 720 }
      }
    };

    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = cameraStream;
    await video.play();

    document.getElementById("instructionOverlay").style.display = "none";

    state = "SCAN_QR";
    updateStepTag("STEP 1: SCAN QR CODE", true);

    canvasElement.style.display = "none";

    scanInterval = setInterval(scanQRCode, 400);
    requestAnimationFrame(loop);

  } catch(e) { 
    showError("เปิดกล้องไม่ได้: " + e.message);
  }
}

// ================= QR =================
function scanQRCode() {
  if (state !== "SCAN_QR" || video.readyState !== video.HAVE_ENOUGH_DATA) return;

  const scanSize = 500;
  canvasElement.width = scanSize;
  canvasElement.height = scanSize;

  const sx = (video.videoWidth - scanSize) / 2;
  const sy = (video.videoHeight - scanSize) / 2;

  canvas.drawImage(video, sx, sy, scanSize, scanSize, 0, 0, scanSize, scanSize);

  const imageData = canvas.getImageData(0, 0, scanSize, scanSize);
  const code = jsQR(imageData.data, imageData.width, imageData.height);

  if (code) handleQRCodeDetected(code.data);
}

function handleQRCodeDetected(qrData) {
  try {
    const url = new URL(qrData);
    console.log("QR RAW:", qrData);

    currentNumber = url.searchParams.get('Number') || "-";
    currentName = url.searchParams.get('name') || "Unknown";
    currentBuble = url.searchParams.get('Buble') || "-";

    console.log("Number =", url.searchParams.get('Number'));
    console.log("name =", url.searchParams.get('name'));
    console.log("Buble =", url.searchParams.get('Buble'));

    document.getElementById("displayUserName").innerHTML =`เลขที่: ${currentNumber}<br>ชื่อ: ${currentName}<br>Bubble: ${currentBuble}`;

    clearInterval(scanInterval);

    state = "SNAP_BOTTLE";

    canvasElement.style.display = "block";

    updateStepTag("STEP 2: SNAP BOTTLE", true);

    document.getElementById("btnSnap").style.display = "flex";
    document.getElementById("btnReset").style.display = "flex";
    document.getElementById("bottleGuide").classList.add("show");

  } catch {
    showError("QR ไม่ถูกต้อง");
  }
}

// ================= ฐานข้อมูลแผ่นเทียบสีมาตรฐาน =================
// ค่าสีเหล่านี้คือค่า "อุดมคติ" ของแผ่นเทียบสี (ควรจูนให้ตรงกับแผ่นจริงของคุณ)
const COLOR_CHART_REF = [
  { lv: 0, r: 238, g: 233, b: 233, name: "ใส" },
  { lv: 1, r: 161, g: 154, b: 115, name: "เหลืองจาง" },
  { lv: 2, r: 255, g: 165, b: 0, name: "เหลืองปกติ" }, // เราจะใช้เลเวล 2 เป็นจุดอ้างอิงแสง
  { lv: 3, r: 141, g: 104, b: 2,   name: "ส้ม" },
  { lv: 4, r: 165, g: 42,  b: 42,  name: "น้ำตาล" }
];

// ================= LOOP (อ่านค่า 2 จุด) =================
// ================= LOOP (อ่านค่าปัสสาวะ เทียบกับ พื้นหลังขาว) =================
function loop() {
  if (state === "COMPLETED") return;

  if (state === "SNAP_BOTTLE" && video.readyState === video.HAVE_ENOUGH_DATA) {
    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;
    canvas.drawImage(video, 0, 0);

    const centerX = canvasElement.width / 2;
    const centerY = canvasElement.height / 2;

    // --- จุดที่ 1: อ่านสีจาก "กลางขวดปัสสาวะ" ---
    const urineRGB = getAvgRGB(centerX, centerY, 20);
    
    // --- จุดที่ 2: อ่านสีจาก "พื้นหลังกระดาษ A4" (จุดที่ไม่มีเงาขวดบัง) ---
    const whiteRGB = getAvgRGB(centerX + 120, centerY - 150, 20); 

    updateColorIndicator(urineRGB, whiteRGB);
  }
  requestAnimationFrame(loop);
}

// Get Average RGB from sample area
function getAvgRGB(x, y, size) {
  const halfSize = size / 2;
  const startX = Math.max(0, Math.floor(x - halfSize));
  const startY = Math.max(0, Math.floor(y - halfSize));
  const width = Math.min(size, canvasElement.width - startX);
  const height = Math.min(size, canvasElement.height - startY);
  
  const data = canvas.getImageData(startX, startY, width, height).data;
  let r = 0, g = 0, b = 0;
  
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  
  const pixels = data.length / 4;
  return [r / pixels, g / pixels, b / pixels];
}
 
// Advanced Color Classification using Yellow Index
function updateColorIndicator(urine, white) {
  // 1. Calculate brightness using luminance formula
  const urineBr = (0.299 * urine[0] + 0.587 * urine[1] + 0.114 * urine[2]);
  const whiteBr = (0.299 * white[0] + 0.587 * white[1] + 0.114 * white[2]);
 
// 2. Calculate Yellow Index (relative blue absorption)
const whiteBlueRatio = white[2] / Math.max(white[0], 1);
const urineBlueRatio = urine[2] / Math.max(urine[0], 1);
const yellowIndex = whiteBlueRatio - urineBlueRatio;

yellowIndexValue = yellowIndex;

// 🔥 เพิ่ม: normalize สี (กันแสงเพี้ยน)
const total = urine[0] + urine[1] + urine[2];
const nr = urine[0] / total;
const ng = urine[1] / total;
const nb = urine[2] / total;

// 🔥 เพิ่ม: Brown Score (ตรวจน้ำตาล)
const brownScore = (nr - ng) + (nr - nb);

// 3. Calculate brightness ratio (transparency indicator)
const brRatio = urineBr / Math.max(whiteBr, 1);

// 4. Classify hydration level
let lv = 1;

// Level 0: ใส
if (yellowIndex < 0.12 && brRatio > 0.82) {
  lv = 0;
}

// 🔥 Level 4: น้ำตาล (เพิ่มใหม่)
else if (brownScore > 0.25 && urineBr < 150) {
  lv = 4;
}

// 🔥 Level 3: ส้มเข้ม / เริ่มน้ำตาล
else if (brownScore > 0.18 || yellowIndex > 0.75) {
  lv = 3;
}

// Level 2: เหลืองปกติ
else if (yellowIndex > 0.28) {
  lv = 2;
}

// Level 1: เหลืองจาง
else {
  lv = 1;
}
 
  currentLV = lv;
 
  // 5. Update UI
  const box = document.getElementById("colorResult");
  const levelInfo = LEVELS[lv];
  
  box.style.background = `rgb(${Math.round(urine[0])}, ${Math.round(urine[1])}, ${Math.round(urine[2])})`;
  box.innerHTML = `
    <div style="font-size:18px; font-weight:bold;">LV.${lv} - ${levelInfo.name}</div>
    <div style="font-size:11px; opacity:0.8; margin-top:4px;">${levelInfo.description} | ความเข้มสีเหลือง: ${(yellowIndex * 100).toFixed(0)}%</div>
  `;
  box.style.color = urineBr > 140 ? "#000" : "#fff";
}
// ================= SNAP =================
// --- เพิ่มตัวแปร Global ไว้ด้านบนสุด ---
let isFlashOn = false;

// --- ฟังก์ชันสำหรับเปิด-ปิดแฟลช ---
async function toggleFlash() {
  if (!cameraStream) return;
  
  const track = cameraStream.getVideoTracks()[0];
  
  // ตรวจสอบว่าเครื่องรองรับแฟลช (Torch) หรือไม่
  try {
    const capabilities = track.getCapabilities();
    if (!capabilities.torch) {
      alert("อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการเปิดแฟลช");
      return;
    }

    isFlashOn = !isFlashOn;
    await track.applyConstraints({
      advanced: [{ torch: isFlashOn }]
    });

    // อัปเดตหน้าตาปุ่ม
    const btn = document.getElementById("btnFlash");
    if (isFlashOn) {
      btn.classList.add("active");
      btn.innerHTML = `<span>🔦</span> <small>ปิดแฟลช</small>`;
    } else {
      btn.classList.remove("active");
      btn.innerHTML = `<span>💡</span> <small>เปิดแฟลช</small>`;
    }
  } catch (e) {
    console.error("Flash Error: ", e);
    alert("ไม่สามารถเปิดแฟลชได้ในโหมดนี้");
  }
}

// --- แก้ไขจุดหนึ่งในฟังก์ชัน takePhoto() ---
function takePhoto() {
  // ก่อนหยุดกล้อง ให้ปิดแฟลชก่อนเสมอ (เพื่อไม่ให้แฟลชค้าง)
  if (isFlashOn) toggleFlash();
  
  document.getElementById("photoSnapshot").src =
    canvasElement.toDataURL('image/jpeg', 0.8);

  document.getElementById("vFrame").style.display="none";
  document.getElementById("photoWrap").classList.add("show");

  if(cameraStream){
    cameraStream.getTracks().forEach(t=>t.stop());
  }

  state="COMPLETED";
  updateStepTag("STEP 3: INPUT TEMP", true);

  document.getElementById("tempArea").classList.add("active");
  document.getElementById("btnSave").style.display="flex";
}

// ================= SAVE =================
async function confirmSave() {
  const temp = document.getElementById('bodyTemp').value;

  if(!temp) return showError("กรอกอุณหภูมิ");
  
  //const tempNum = parseFloat(temp);
  
  if(temp < 32 || temp > 42){
    return showError("อุณหภูมิผิดปกติ! (ต้องอยู่ระหว่าง 35.0 - 42.0)");
    
  }
  const now = new Date();
  const record = {
    date: now.toLocaleDateString('th-TH'),
    Number: currentNumber,
    name: currentName,
    buble: currentBuble,
    temp,
    level: currentLV,
    status: LEVELS[currentLV].name,
    time: new Date().toLocaleTimeString('th-TH')
  };

  historyData.unshift(record);
  localStorage.setItem('urine_history_v2', JSON.stringify(historyData.slice(0,20)));
  renderHistory();

  try {
    await fetch(CONFIG_SHEET_URL,{
      method:"POST",
      mode:"no-cors",
      body:JSON.stringify(record)
    });

    document.getElementById("syncStatus").textContent="✅ สำเร็จ";

    setTimeout(resetApp,1200); // 🔥 ไม่ reload

  } catch {
    showError("ส่งข้อมูลไม่สำเร็จ");
  }
}

// ================= RESET (สำคัญสุด) =================
function resetApp() {
  state="IDLE";

  document.getElementById("photoWrap").classList.remove("show");
  document.getElementById("vFrame").style.display="block";
  document.getElementById("btnSnap").style.display = "none";
  document.getElementById("btnSave").style.display="none";
  document.getElementById("btnReset").style.display="none";
  document.getElementById("tempArea").classList.remove("active");

  document.getElementById("bodyTemp").value="";
  document.getElementById("displayUserName").textContent="รอสแกน QR CODE...";
  document.getElementById("colorResult").innerHTML="สี: --";

  document.getElementById("bottleGuide").classList.remove("show");

  updateStepTag("STEP 1: SCAN QR CODE", true);

  initCamera(); // 🔥 กลับไปสแกนต่อทันที
}

// ================= UI =================
function renderHistory(){
  const body=document.getElementById("historyBody");
  body.innerHTML=historyData.map(r=>`
    <tr>
      <td>${r.date}</td>
      <td>${r.time}</td>
      <td>${r.Number}</td>
      <td>${r.name}</td>
      <td>${r.temp}°</td>
      <td>LV.${r.level}</td>
    </tr>
  `).join('');
}

function updateStepTag(t,a){
  const el=document.getElementById('stepTag');
  el.textContent=t;
  el.classList.toggle('active',a);
}

function showError(m){
  const el=document.getElementById('errorMessage');
  el.textContent=m;
  el.classList.add('show');
}

function startClock(){
  setInterval(()=>{
    document.getElementById('clock').textContent=
      new Date().toLocaleTimeString('th-TH');
  },1000);
}

