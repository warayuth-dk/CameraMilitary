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

// ================= LOOP =================
function loop() {
  if (state === "COMPLETED") return;

  if (state === "SNAP_BOTTLE" && video.readyState === video.HAVE_ENOUGH_DATA) {
    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;

    canvas.drawImage(video, 0, 0);

    const imgData = canvas.getImageData(
      canvasElement.width/2 - 7,
      canvasElement.height/2 - 7,
      15,
      15
    ).data;

    let r=0,g=0,b=0;
    for(let i=0;i<imgData.length;i+=4){
      r+=imgData[i];
      g+=imgData[i+1];
      b+=imgData[i+2];
    }

    const px = imgData.length/4;
    updateColorIndicator([r/px,g/px,b/px]);
  }

  requestAnimationFrame(loop);
}

// ================= COLOR =================
function updateColorIndicator([r,g,b]) {
  const brightness = (r+g+b)/3;

  // 👉 หาความใส
  const colorDiff = Math.max(r,g,b) - Math.min(r,g,b);

  // 👉 แปลง RGB -> HSV
  const r1 = r/255, g1 = g/255, b1 = b/255;
  const max = Math.max(r1,g1,b1);
  const min = Math.min(r1,g1,b1);
  const delta = max - min;

  let h = 0, s = 0, v = max;

  if (delta !== 0) {
    s = delta / max;

    if (max === r1) {
      h = 60 * (((g1 - b1) / delta) % 6);
    } else if (max === g1) {
      h = 60 * ((b1 - r1) / delta + 2);
    } else {
      h = 60 * ((r1 - g1) / delta + 4);
    }
  }

  if (h < 0) h += 360;

  // ================= LEVEL LOGIC =================

 // --- ส่วนการคำนวณ H, S, L หรือ Hue/Saturation ต้องคำนวณมาก่อนหน้านี้นะครับ ---

  if (brightness > 200 && colorDiff < 15 && s < 0.1) {
    currentLV = 0; // ใส (ใสเหมือนน้ำเปล่า)
  }
  else if (h >= 10 && h < 38 && s >= 0.40) {
    currentLV = 4; // เข้ม/น้ำตาล (เช็คค่าวิกฤตก่อน)
  }
  else if (h >= 25 && h < 40 && s >= 0.35) {
    currentLV = 3; // ส้ม (ขาดน้ำ)
  }
  else if (h >= 38 && h <= 68 && s >= 0.18) { 
    // จูน LV.2 ให้ครอบคลุมมากขึ้น 
    // โดยเช็คว่าถ้า Saturation เกิน 0.18 (เริ่มมีสี) แต่ยังอยู่ในโซนสีเหลือง ให้เป็น LV.2
    currentLV = 2; // เหลือง
  }
  else if (s < 0.18 && brightness > 160) {
    // ถ้าสีจางกว่า 0.18 ลงไป (จืดเกือบขาว) ให้ตกมาอยู่ที่ LV.1
    currentLV = 1; // เหลืองจาง
  }
  else {
    // กรณีอื่นๆ ที่หลุดรอดมา ให้ Default ไว้ที่ค่าใดค่าหนึ่ง (แนะนำ LV.1 หรือ 2 ตามหน้างาน)
    currentLV = 1; 
  }

  // ================= UI =================
  const lv = LEVELS[currentLV];
  const box = document.getElementById("colorResult");

  box.style.background = `rgb(${r},${g},${b})`;
  box.innerHTML = `LV.${currentLV} - ${lv.name}`;
  box.style.color = brightness>150?"#000":"#fff";
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