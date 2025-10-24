const express = require("express");
const router = express.Router();
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const { execSync } = require("child_process");

// Configure multer for video uploads
const upload = multer({ 
  dest: '/tmp/uploads/',
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB max
  }
});

// Find system FFmpeg
function getSystemFFmpegPath() {
  try {
    const result = execSync('which ffmpeg', { encoding: 'utf8' });
    return result.trim();
  } catch (error) {
    return '/usr/bin/ffmpeg'; 
  }
}


const ffmpegPath = getSystemFFmpegPath();

ffmpeg.setFfmpegPath(ffmpegPath);

// Health check endpoint
router.get("/health", (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'Video Compression API',
    ffmpegPath,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Video compression endpoint
router.post("/compress-video", upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  const inputPath = req.file.path;
  const outputPath = `/tmp/compressed_${Date.now()}.mp4`;
  
  console.log(`📥 Received: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)}MB)`);
  
  try {
    // Get metadata
    const metadata = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, data) => {
        if (err) {
          console.error('❌ FFprobe error:', err);
          reject(err);
        } else {
          resolve(data);
        }
      });
    });

    const duration = metadata.format.duration;
    console.log(`⏱️  Duration: ${duration}s`);

    // Compress video
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec('libx264')
        .size('1280x?')                    // Max 720p width
        .videoBitrate('1000k')             // 1 Mbps
        .audioBitrate('128k')              // 128 kbps
        .fps(30)                           // 30 fps
        .outputOptions([
          '-preset veryfast',              // Fast compression
          '-crf 24',                       // Good quality
          '-movflags +faststart',          // Web streaming
          '-pix_fmt yuv420p',              // Compatibility
          '-max_muxing_queue_size 9999'
        ])
        .on('start', (cmd) => {
          console.log('🎬 FFmpeg command:', cmd);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`⚙️  Progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', resolve)
        .on('error', (err) => {
          console.error('❌ FFmpeg error:', err);
          reject(err);
        })
        .save(outputPath);
    });
    
    // Get file sizes
    const originalSize = req.file.size;
    const compressedSize = fs.statSync(outputPath).size;
    const savedPercent = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
    
    console.log(`💾 Original: ${(originalSize / 1024 / 1024).toFixed(2)}MB`);
    console.log(`💾 Compressed: ${(compressedSize / 1024 / 1024).toFixed(2)}MB`);
    console.log(`💰 Saved: ${savedPercent}%`);
    
    // Send compressed video
    res.sendFile(outputPath, (err) => {
      if (err) {
        console.error('❌ Send file error:', err);
      }
      
      // Cleanup
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        console.log('🧹 Cleanup complete');
      } catch (cleanupErr) {
        console.error('⚠️  Cleanup error:', cleanupErr);
      }
    });
    
  } catch (error) {
    console.error('❌ Compression error:', error);
    
    // Cleanup on error
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch (cleanupErr) {
      console.error('⚠️  Cleanup error:', cleanupErr);
    }
    
    res.status(500).json({ 
      error: 'Compression failed',
      message: error.message 
    });
  }
});

module.exports = router;