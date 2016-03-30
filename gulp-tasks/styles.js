var
	argv = require('./argv.js'),
	fileExists = require('file-exists'),
	gulp = require('gulp'),
	less = require('gulp-less'),
	gutil = require('gulp-util'),
	concat = require('gulp-concat-util'),
	plumber = require('gulp-plumber'),

	aModulesNames = argv.getModules(),
	aModulesFiles = [],
	aModulesWatchPaths = [],
	
	sTheme = argv.getParameter('--theme').toLowerCase()
;
	
aModulesNames.forEach(function (sModuleName) {
	if (fileExists('./modules/' + sModuleName + '/styles/styles.less'))
	{
		aModulesFiles.push('./modules/' + sModuleName + '/styles/styles.less');
		aModulesWatchPaths.push('./modules/' + sModuleName + '/styles/**/*.less');
	}
});

gulp.task('styles', function () {
	
	gulp.src(aModulesFiles)
		.pipe(concat('styles.css', {
			process: function(sSrc, sFilePath) {
				var
					sThemePath = sFilePath.replace('styles.less', 'themes/' + sTheme + '.less'),
					sRes = fileExists(sThemePath) ? '@import "' + sThemePath + '";\r\n' : ''
				;
				
				return sRes + '@import "' + sFilePath + '";\r\n'; 
			}
		}))
		.pipe(plumber({
			errorHandler: function (err) {
				console.log(err.toString());
				gutil.beep();
				this.emit('end');
			}
		}))
		.pipe(less())
		.pipe(gulp.dest('./skins/Default'))
		.on('error', gutil.log);
});

gulp.task('styles:watch', ['styles'], function () {
	gulp.watch(aModulesWatchPaths, {interval: 500}, ['styles']);
});

module.exports = {};
