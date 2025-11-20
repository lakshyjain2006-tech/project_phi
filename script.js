const API_KEY = "AIzaSyA7arBccFOh6eukT-s4syYPdZKFySzhCwQ"; // <-- Replace with your Gemini API key

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const preview = document.getElementById("preview");
const output = document.getElementById("output");
const startBtn = document.getElementById("startBtn");
const fileBtn = document.getElementById("fileBtn");
const imageFile = document.getElementById("imageFile");
const describeBtn = document.getElementById("describeBtn");

let base64Image = "";
let detectedLang = "en";
let speechUtterance;
let recognition;

// Map keywords to language codes
const languageMap = {
    "english": "en",
    "hi": "hi",
    "hindi": "hi",
    "spanish": "es",
    "español": "es",
    "french": "fr",
    "français": "fr"
};

// --- Hands-Free Mode ---
startBtn.addEventListener("click", async () => {
    if (recognition) {
        recognition.abort();
    }
    
    startBtn.disabled = true;
    output.innerHTML = "Listening for commands... 🎤";

    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    
    await startCamera();
    
    recognition.start();

    recognition.onresult = async (event) => {
        const lastResult = event.results[event.results.length - 1];
        if (lastResult.isFinal) {
            const transcript = lastResult[0].transcript.toLowerCase().trim();
            
            if (transcript.includes("capture") || transcript.includes("take photo")) {
                output.innerHTML = "📸 Capturing photo...";
                processAndPreviewImage(video);
            } else if (transcript.includes("describe") && base64Image) {
                output.innerHTML = "🔍 Describing image...";
                describeImage(detectedLang);
            } else if (transcript.includes("stop")) {
                if (speechUtterance) speechSynthesis.cancel();
                recognition.stop();
                startBtn.disabled = false;
                output.innerHTML = "Voice commands stopped.";
                return;
            } else {
                detectLanguage(transcript);
            }
        }
    };

    recognition.onerror = (event) => {
        console.error("Recognition error:", event.error);
        startBtn.disabled = false;
    };
    
    recognition.onend = () => {
        if (startBtn.disabled) {
            setTimeout(() => recognition.start(), 100);
        }
    };
});

// --- Start Camera ---
async function startCamera() {
    if (!video.srcObject) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        video.style.display = "block";
    }
}

// --- Image File Upload Handler ---
fileBtn.addEventListener("click", () => {
    imageFile.value = '';
    imageFile.click();
});
imageFile.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
        const img = new window.Image();
        const reader = new FileReader();
        reader.onload = function(evt) {
            img.onload = function() {
                processAndPreviewImage(img);
            };
            img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
    }
});

// --- Process Any Image Source (video or file) ---
function processAndPreviewImage(source) {
    const ctx = canvas.getContext("2d");
    let sourceWidth, sourceHeight;
    if (source instanceof HTMLVideoElement) {
        sourceWidth = source.videoWidth;
        sourceHeight = source.videoHeight;
    } else { // Image element
        sourceWidth = source.width;
        sourceHeight = source.height;
    }
    const targetWidth = 256;
    const scale = targetWidth / sourceWidth;
    const targetHeight = Math.floor(sourceHeight * scale);

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);

    const dataUrl = canvas.toDataURL("image/jpeg");
    base64Image = dataUrl.split(",")[1];

    preview.src = dataUrl;
    preview.style.display = "block";
    video.style.display = "none";
    canvas.style.display = "none";
    describeBtn.style.display = "inline-block";
    detectedLang = "en";
    output.innerHTML = "Image ready! Click 'Describe' or speak the desired language before describing.";
}

// --- Describe Button Handler ---
describeBtn.addEventListener("click", () => {
    if (!base64Image) {
        output.innerHTML = "Please capture or select an image first.";
        return;
    }
    output.innerHTML = `Detected language: ${detectedLang}. Describing image...`;
    describeImage(detectedLang);
});

// --- Detect Language ---
function detectLanguage(transcript) {
    detectedLang = "en";
    for (const [key, code] of Object.entries(languageMap)) {
        if (transcript && transcript.includes(key)) {
            detectedLang = code;
            break;
        }
    }
    if (base64Image) {
        output.innerHTML = `Detected language: ${detectedLang}. Click 'Describe' to proceed.`;
    } else {
        output.innerHTML = `Detected language: ${detectedLang}. Please capture or choose an image.`;
    }
}

// --- Describe Image ---
async function describeImage(lang) {
    if (!base64Image) return;
    output.innerHTML = `
        <div style="text-align:center;">
            <img src="data:image/jpeg;base64,${base64Image}" style="max-width:60%;border-radius:12px;margin-bottom:10px;" />
            <br>
            <span>Processing image, may take a moment...</span>
        </div>
    `;
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                { text: `Describe this image in clear, simple bullet points in ${lang}. Format as: • Main subject • Colors • Actions • Background • Other details` },
                                { inline_data: { mime_type: "image/jpeg", data: base64Image } }
                            ]
                        }
                    ]
                })
            }
        );
        const result = await response.json();
        let description = '';
        if (
            result &&
            Array.isArray(result.candidates) &&
            result.candidates[0] &&
            result.candidates[0].content &&
            Array.isArray(result.candidates[0].content.parts) &&
            result.candidates[0].content.parts[0] &&
            result.candidates[0].content.parts[0].text
        ) {
            description = result.candidates[0].content.parts[0].text;
        } else if (result && result.error) {
            description = `Error: ${result.error.message || result.error}`;
        } else {
            description = "Unable to describe the image. Please try again.";
        }

        const formattedDescription = formatDescription(description);
        
        output.innerHTML = `
            <div style="text-align:center;">
                <img src="data:image/jpeg;base64,${base64Image}" style="max-width:60%;border-radius:12px;margin-bottom:10px;" />
                <br>
                <div style="background:#f0f0f0;padding:20px;border-radius:8px;margin:10px;text-align:left;font-size:16px;line-height:1.6;">
                    ${formattedDescription}
                </div>
            </div>
        `;

        if (description && !description.includes("Error")) {
            const cleanText = description.replace(/[•\-\*]/g, '').replace(/\n/g, '. ');
            speechUtterance = new SpeechSynthesisUtterance(cleanText);
            speechUtterance.lang = lang === "hi" ? "hi-IN" : lang === "es" ? "es-ES" : lang === "fr" ? "fr-FR" : "en-US";
            speechUtterance.rate = 0.7;
            speechSynthesis.speak(speechUtterance);
        }
    } catch (error) {
        console.error("Error:", error);
        output.innerHTML = `<b>Error:</b> ${error.message}`;
    }
}

function formatDescription(text) {
    if (!text || text.includes("Error")) return text;
    
    return text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
            if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
                return `<div style="margin:8px 0;"><strong>•</strong> ${line.substring(1).trim()}</div>`;
            }
            return `<div style="margin:8px 0;"><strong>•</strong> ${line}</div>`;
        })
        .join('');
}