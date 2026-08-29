// js/video-validator.js — Client-Side AI & Video Editing Detection Pipeline

const MAX_VIDEO_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB Hard Limit

export async function validateVideoFile(file) {
  // 1. Check Hard File Size
  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    return {
      valid: false,
      reason: "SIZE_EXCEEDED",
      message: `Video size is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Files over 25 MB cannot be uploaded to feed.`
    };
  }

  // Slice first 50KB to read MP4/MOV container headers (atoms/UUID boxes)
  const headerSlice = await file.slice(0, 50000).arrayBuffer();
  const decoder = new TextDecoder("ascii");
  const headerText = decoder.decode(headerSlice);

  // 2. Scan for C2PA AI Digital Manifest Identifiers
  const isAIGenerated = checkAIProvenance(headerText);
  if (isAIGenerated) {
    return {
      valid: false,
      reason: "AI_BANNED",
      message: "AI-generated or synthetic video markers detected. AI uploads are strictly prohibited."
    };
  }

  // 3. Scan for Post-Production / NLE Editing Signatures
  const isEdited = checkEditingSoftware(headerText);
  if (isEdited) {
    return {
      valid: false,
      reason: "EDITED_BANNED",
      message: "Edited video signatures detected (CapCut, Premiere, etc.). Only unedited raw footage is accepted."
    };
  }

  return { valid: true };
}

function checkAIProvenance(text) {
  const aiKeywords = [
    "trainedAlgorithmicMedia",
    "c2pa.assertions",
    "c2pa.actions",
    "RunwayML",
    "Sora",
    "Pika",
    "Kling"
  ];
  return aiKeywords.some(kw => text.includes(kw));
}

function checkEditingSoftware(text) {
  const editorKeywords = [
    "CapCut", "Premiere", "Final Cut", "DaVinci", "HandBrake", "After Effects", "InShot"
  ];
  return editorKeywords.some(kw => text.includes(kw));
}
