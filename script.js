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
  { lv: 0, r: 255, g: 255, b: 224, name: "ใส" },
  { lv: 1, r: 255, g: 255, b: 0, name: "เหลืองจาง" },
  { lv: 2, r: 255, g: 191, b: 0, name: "เหลืองปกติ" }, // เราจะใช้เลเวล 2 เป็นจุดอ้างอิงแสง
  { lv: 3, r: 255, g: 0, b: 0,   name: "ส้ม" },
  { lv: 4, r: 165, g: 42,  b: 42,  name: "น้ำตาล" }
];

// ================= LOOP (อ่านค่า 2 จุด) =================
function loop() {
  if (state === "COMPLETED") return;

  if (state === "SNAP_BOTTLE" && video.readyState === video.HAVE_ENOUGH_DATA) {
    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;
    canvas.drawImage(video, 0, 0);

    const centerX = canvasElement.width / 2;
    const centerY = canvasElement.height / 2;

    // --- จุดที่ 1: อ่านสีจากขวดปัสสาวะ (กึ่งกลางจอ) ---
    const targetRGB = getAvgRGB(centerX, centerY, 15);
    
    // --- จุดที่ 2: อ่านสีจากแผ่นเทียบสี (ตำแหน่งที่แผ่นสีเลเวล 2 วางอยู่) ---
    // ปรับค่า +120 หรือตามตำแหน่งจริงที่คุณติดแผ่นสีไว้ในกล่อง
    const refRGB = getAvgRGB(centerX + 120, centerY, 15);

    updateColorIndicator(targetRGB, refRGB);
  }

  requestAnimationFrame(loop);
}

// ฟังก์ชันช่วยหาค่าสีเฉลี่ยในพื้นที่
function getAvgRGB(x, y, size) {
  const imgData = canvas.getImageData(x - size/2, y - size/2, size, size).data;
  let r=0, g=0, b=0;
  for(let i=0; i<imgData.length; i+=4){
    r += imgData[i]; g += imgData[i+1]; b += imgData[i+2];
  }
  const px = imgData.length/4;
  return [r/px, g/px, b/px];
}

// ================= COLOR (ระบบชดเชยแสงและตัดสินเลเวล) =================
function updateColorIndicator(targetRGB, refRGB) {
  const [r_raw, g_raw, b_raw] = targetRGB;

  // 1. คำนวณหา Calibration Factor (แสงแดด/เงา เปลี่ยนไปแค่ไหน?)
  // เทียบสีแผ่นที่กล้องเห็น (refRGB) กับสีมาตรฐาน (COLOR_CHART_REF[2])
  const rFactor = refRGB[0] / COLOR_CHART_REF[2].r;
  const gFactor = refRGB[1] / COLOR_CHART_REF[2].g;
  const bFactor = refRGB[2] / COLOR_CHART_REF[2].b;

  // 2. ชดเชยค่าสีให้ขวดปัสสาวะ (Calibrated RGB)
  // วิธีนี้จะทำให้สีขวด "สะอาด" เหมือนไม่มีเงาหรือแสงแดดมาปน
  const r = r_raw / Math.max(rFactor, 0.01);
  const g = g_raw / Math.max(gFactor, 0.01);
  const b = b_raw / Math.max(bFactor, 0.01);

  const brightness = (r + g + b) / 3;
  const colorDiff = Math.max(r, g, b) - Math.min(r, g, b);

  // 3. แปลง RGB -> HSV (ใช้ค่าที่ Calibrate แล้ว)
  const r1 = r/255, g1 = g/255, b1 = b/255;
  const max = Math.max(r1, g1, b1), min = Math.min(r1, g1, b1), delta = max - min;
  let h = 0, s = (max === 0) ? 0 : delta / max;
  if (delta !== 0) {
    if (max === r1) h = 60 * (((g1 - b1) / delta) % 6);
    else if (max === g1) h = 60 * ((b1 - r1) / delta + 2);
    else h = 60 * ((r1 - g1) / delta + 4);
  }
  if (h < 0) h += 360;

  // 4. LEVEL LOGIC (ใช้ logic เดิมของคุณได้เลย แต่จะแม่นยำขึ้นมาก)
  if (brightness > 200 && colorDiff < 15 && s < 0.1) {
    currentLV = 0; // ใส
  }
  else if (h >= 10 && h < 38 && s >= 0.40) {
    currentLV = 4; // น้ำตาล
  }
  else if (h >= 25 && h < 40 && s >= 0.35) {
    currentLV = 3; // ส้ม
  }
  else if (h >= 38 && h <= 68 && s >= 0.18) { 
    currentLV = 2; // เหลือง
  }
  else if (s < 0.18 && brightness > 160) {
    currentLV = 1; // เหลืองจาง
  }
  else {
    currentLV = 1; 
  }

  // 5. แสดงผล UI
  const lv = LEVELS[currentLV];
  const box = document.getElementById("colorResult");

  // แสดงสีจริงที่กล้องเห็น (r_raw) ในกล่อง UI แต่ใช้เลเวลที่ผ่านการคำนวณแล้ว
  box.style.background = `rgb(${r_raw},${g_raw},${b_raw})`;
  box.innerHTML = `LV.${currentLV} - ${lv.name} <br> <small>(Calibrated Mode)</small>`;
  box.style.color = (r_raw + g_raw + b_raw) / 3 > 150 ? "#000" : "#fff";
}

// ================= SNAP =================
function takePhoto() {
  document.getElementById("photoSnapshot").src =
    canvasElement.toDataURL('image/jpeg',0.8);

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

