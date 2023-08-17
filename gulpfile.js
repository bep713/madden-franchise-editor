const gulp = require('gulp');
const sass = require('gulp-sass')(require('node-sass'));
const sourcemaps = require('gulp-sourcemaps');

gulp.task('sass', function () {
  return gulp.src('renderer/sass/app-manifest.scss')
    .pipe(sourcemaps.init())
    .pipe(sass())
    .on('error', sass.logError)
    .pipe(sourcemaps.write())
    .pipe(gulp.dest('renderer/css'));
});

gulp.task('sass:watch', function () {
  gulp.watch('renderer/sass/**/*.scss', gulp.series('sass'));
});