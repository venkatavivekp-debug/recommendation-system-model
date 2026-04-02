const multer = require('multer');
const AppError = require('../utils/appError');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024,
  },
  fileFilter: (req, file, callback) => {
    const mimeType = String(file.mimetype || '').toLowerCase();
    if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) {
      callback(null, true);
      return;
    }

    callback(new AppError('Only image and video files are supported', 400, 'VALIDATION_ERROR'));
  },
});

function uploadFoodMedia(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      next(new AppError('File size cannot exceed 12MB', 400, 'VALIDATION_ERROR'));
      return;
    }

    next(error);
  });
}

module.exports = {
  uploadFoodMedia,
};
