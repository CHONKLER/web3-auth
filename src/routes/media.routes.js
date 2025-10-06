const express = require("express");
const router = express.Router();
const { getPlaiceholder } = require("plaiceholder");
const { exec } = require("child_process");
const { promisify } = require("util");
const admin = require("firebase-admin");
const { readFile, unlink } = require("fs/promises");
const { existsSync } = require("fs");

const execAsync = promisify(exec);

// Helper function to check if URL is a processable image
function isProcessableImage(url) {
  if (!url) return false;
  
  const urlLower = url.toLowerCase();
  
  // Skip videos
  const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.flv', '.wmv'];
  if (videoExtensions.some(ext => urlLower.includes(ext))) return false;
  
  // Accept all images including GIFs
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.gif'];
  if (imageExtensions.some(ext => urlLower.includes(ext))) return true;
  
  // For Firebase Storage URLs, skip only if it contains 'video'
  return !urlLower.includes('video');
}

// Blur generation endpoint
router.post("/generate-ImgBlur", async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: "Image URL is required" });
    }

    // Check if it's a processable image
    if (!isProcessableImage(imageUrl)) {
      console.log(`Skipping blur generation for non-image: ${imageUrl}`);
      return res.json({
        blurDataURL: null,
        skipped: true,
        reason: "Not a processable image (video or unsupported format)",
      });
    }

    console.log(`🎨 Generating blur data for: ${imageUrl}`);

    // Fetch the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    // Check content type
    const contentType = response.headers.get("content-type") || "";
    if (contentType.startsWith("video/")) {
      console.log(`Skipping blur generation for video content type: ${contentType}`);
      return res.json({
        blurDataURL: null,
        skipped: true,
        reason: `Video content type: ${contentType}`,
      });
    }

    // Convert to Buffer
    const buffer = Buffer.from(await response.arrayBuffer());

    // Generate blur placeholder
    const { base64 } = await getPlaiceholder(buffer);

    console.log(`✅ Blur data generated successfully`);

    return res.json({
      blurDataURL: base64,
      skipped: false,
    });
  } catch (error) {
    console.error("❌ Blur generation error:", error);
    return res.status(500).json({
      error: "Failed to generate blur data",
      details: error.message,
      blurDataURL: null,
    });
  }
});

// Video thumbnail generation endpoint
router.post("/generate-vidThumbnail", async (req, res) => {
  const { videoUrl, docId } = req.body;

  let tempVideoPath = null;
  let thumbnailPath = null;

  try {
    // Validate inputs
    if (!videoUrl || !docId) {
      return res.status(400).json({ error: "Missing videoUrl or docId" });
    }

    // Check if FFmpeg is available
    try {
      await execAsync("ffmpeg -version");
    } catch (error) {
      return res.status(500).json({ error: "FFmpeg not available on server" });
    }

    const timestamp = Date.now();
    tempVideoPath = `/tmp/video_${timestamp}.mp4`;
    thumbnailPath = `/tmp/thumb_${timestamp}.jpg`;

    console.log(`Generating thumbnail for ${docId}...`);

    // Download video to temporary location
    console.log("Downloading video...");
    await execAsync(`curl -o "${tempVideoPath}" -L "${videoUrl}"`);

    if (!existsSync(tempVideoPath)) {
      throw new Error("Failed to download video");
    }

    // Extract thumbnail at 1 second mark (or first frame if video is very short)
    console.log("Extracting thumbnail...");
    try {
      await execAsync(
        `ffmpeg -i "${tempVideoPath}" -ss 00:00:01 -vframes 1 -q:v 2 -y "${thumbnailPath}"`
      );
    } catch (error) {
      // Fallback to first frame if seeking to 1 second fails
      console.log("Fallback: extracting first frame...");
      await execAsync(
        `ffmpeg -i "${tempVideoPath}" -vframes 1 -q:v 2 -y "${thumbnailPath}"`
      );
    }

    if (!existsSync(thumbnailPath)) {
      throw new Error("Failed to generate thumbnail");
    }

    // Read the generated thumbnail
    const thumbnailBuffer = await readFile(thumbnailPath);

    // Upload thumbnail to Firebase Storage
    const bucket = admin.storage().bucket();
    const thumbnailFileName = `thumbnails/${docId}_thumbnail.jpg`;
    const file = bucket.file(thumbnailFileName);

    console.log("Uploading thumbnail to Firebase Storage...");
    await file.save(thumbnailBuffer, {
      metadata: {
        contentType: "image/jpeg",
        metadata: {
          originalVideoUrl: videoUrl,
          generatedAt: new Date().toISOString(),
        },
      },
    });

    // Make the file publicly accessible
    await file.makePublic();

    // Get the public URL
    const thumbnailUrl = `https://storage.googleapis.com/${bucket.name}/${thumbnailFileName}`;

    console.log(`Thumbnail generated successfully: ${thumbnailUrl}`);

    return res.json({
      success: true,
      thumbnailUrl,
      message: "Thumbnail generated successfully",
    });
  } catch (error) {
    console.error("Thumbnail generation failed:", error);
    return res.status(500).json({
      error: "Thumbnail generation failed",
      details: error.message,
    });
  } finally {
    // Cleanup temporary files
    try {
      if (tempVideoPath && existsSync(tempVideoPath)) {
        await unlink(tempVideoPath);
        console.log("Cleaned up temporary video file");
      }
      if (thumbnailPath && existsSync(thumbnailPath)) {
        await unlink(thumbnailPath);
        console.log("Cleaned up temporary thumbnail file");
      }
    } catch (cleanupError) {
      console.warn("Failed to cleanup temporary files:", cleanupError);
    }
  }
});

module.exports = router;