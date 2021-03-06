#!/usr/bin/env node

// reintegrat_tizen.js is internal tool for using when developing Tizen support for Titanium SDK.
// It allow create Tizenium SDK with latest files from titanium_mobile_tizen without waiting for CI build.
// that get existing zipped Titanium SDK, remove tizen directory fron it 

// 1) validate a zip file argument was supplied
// 2) unzip the zip file using node_appc
// 3) copy the "mobileweb" directory to "tizen"
// 4) remove mobileweb, facebook support, ios specific resources etc.
// 4) copy tizen files (cli, templates, titanium) on top of "tizen" directory
// 5) copy titanium-sdk/lib/tiappxml.js on top of node_modules/titanium-sdk/lib
// 6) run dependencies.json builder using titanium_mobile/support/mobileweb/dependencyAnalyzer
// 7) re-zip distribution file with "VERSION-tizen.zip"

//input parameters:
// path to zip
// output file name
// working directory unzip original sdk

// simple hack to enable debugger output
process.env.DEBUG = process.env.DEBUG || 'BUILD:info';

var fs = require('fs'),
	path = require('path'),
	async = require('async'),
	appc = require('node-appc'),
	xmldom = require('xmldom'),
	wrench = require('wrench'),
	shell = require('shelljs/global'),
	debug = require('debug'),
	admzip = require('adm-zip'),
	args = process.argv.slice(2),
	runningOnWin32 = (process.platform === 'win32'),
	workingDir = void 0,
	titaniumTizenDir = __dirname,
	sdkRoot, resultPath;

// silence shelljs output
config.silent = true;

// create info logger
var info = debug('BUILD:info');

info('Starting');

async.series([

function(next) {
	if (validateArgs(args)) {
		//creating temporary working directory
		var random = Math.random ().toString ().substring (2);
		workingDir = path.join(tempdir(), random);
		fs.mkdirSync(workingDir);
		next(null, 'ok');
	}
}, function(next) {
	info('Start unzip');
	//Unzip callback
	var unzip,
		resultCb = function(errorMsg) {
			if (errorMsg) {
				info('unzip finished with error: ' + errorMsg);
			}
			//ignoring error, with current beta builds we have it always, due to zip content
			next(null, 'ok');
		};
	unzip = runningOnWin32 ? unzip7za : appc.zip.unzip;
	unzip(args[0], workingDir, resultCb);
}, function(next) {
	//after unzip we use directories names to find target OS and SDK names and create output file name
	// get sdk os version
	var os = (ls(workingDir + '/' + 'mobilesdk' ))[0],
		sdkVersion = (ls(workingDir + '/' + 'mobilesdk/' + os + '/'))[0];

	info('os:' + os);
	info('sdkVersion:' + sdkVersion);
	// create output file path and remove if it already exists
	resultPath = (args[1] || path.dirname(args[0])) + '/tizen-' + sdkVersion + '-' + os + '.zip';
	info('outFile:' + resultPath);
	if (fs.existsSync(resultPath)) {
		fs.unlinkSync(resultPath);
	}
	sdkRoot = path.join(workingDir, 'mobilesdk', os, sdkVersion);
	next(null, 'ok');
}, function(next) {	
	info('Create tizen platform, initially copy it from mobileweb');
	patchingSDK(function() {
		next(null, 'ok');
	});
}, function(next) {
	executeDependenciesAnalyzer(function() {
		next(null, 'ok');
	});
}, function(next) {
	if (runningOnWin32) {
		info('Start packaging on win32');
		packagingSDK7z(function() {
			next(null, 'ok');
		});
	} else {
		packagingSDKLinux(function() {
			next(null, 'Packaging on linux ok');
		});
	}
}, function(next) {
	//cleanup
	info('Deleting temporary directory ' + workingDir);
	rm('-rf', workingDir);
}], function(err) {
	if (err) {
		info(err);
	}
	info('Finished.');
});

//validating input parameters
function validateArgs(params) {
	var workOk = true;
	if (!fs.existsSync(params[0])) {
		info('Error: param 1 should point existng zip archive. Current value: ' + params[0]);
		workOk = false;
	}

	if(params[1]){
		var stats = fs.statSync(params[1]);
		if (!stats.isDirectory()) {
			info('Error: param 2 should point existing directory. Current value: ' + params[1]);
			workOk = false;
		}
	}
	return workOk;
}

function patchingSDK(finish) {
	var createDirs = [
			'utils'
		],
		overrideFiles = [
			'titanium/Ti',
			'cli/commands',
			'titanium/Ti.js',
			'templates/app/config.tmpl',
			'templates/app/default/Resources/tizen',
			'src/loader.js',
			'src/index.html',
			'dependencyAnalyzer',
			'themes',
			'utils/signapp.jar'
		],
		exclude = [
			'titanium/Ti/Facebook',
			'titanium/Ti/Facebook.js',
			'resources/apple_startup_images',
			'templates/app/default/Resources/mobileweb/apple_startup_images'		
		],
		pathToTizenInInSdk = path.join(sdkRoot, 'tizen'),
		pathToModule = path.join(workingDir, 'modules','tizen');

	//Directory tizen may already exists in archive if we re-pack sdk with tizen support. Remove it
	if (fs.existsSync(pathToTizenInInSdk)) {
		wrench.rmdirSyncRecursive(pathToTizenInInSdk, true);
	}

	info('wrench.copyDirSyncRecursive from ' + path.join(sdkRoot, 'mobileweb') + " to " + pathToTizenInInSdk);
	wrench.copyDirSyncRecursive(path.join(sdkRoot, 'mobileweb'), pathToTizenInInSdk);

	createDirs.forEach( function (dirpath) {
		fs.mkdirSync(path.join(pathToTizenInInSdk, dirpath));
	});

	overrideFiles.forEach( function (patch) {
		var source = path.join(titaniumTizenDir, patch),
			stats = fs.statSync(source);
		info('Copy ' + source + ' into '+ path.join(pathToTizenInInSdk, patch));
		if (stats.isDirectory()) {
			copyDirSyncRecursiveEx(source, path.join(pathToTizenInInSdk, patch));
		} else {
			copyFileSync(source, path.join(pathToTizenInInSdk, patch));
		}
	});

	exclude.forEach( function (target) {
		var source = path.join(pathToTizenInInSdk, target),
			stats = fs.statSync(source);
		info('Deleting ' + source);
		if (stats.isDirectory()) {
			wrench.rmdirSyncRecursive(source, false);
		} else {
			fs.unlinkSync(source);
		}
	});

	//copy module with Tizen API
	if (fs.existsSync(pathToModule)) {
		//deleting existing tizen module module in source titanium sdk
		info('Deleting ' + pathToModule);
		wrench.rmdirSyncRecursive(pathToModule, true);
	}
	fs.mkdirSync(pathToModule);	
	cp('-R', path.join(titaniumTizenDir, 'modules') + '/*', pathToModule);
	finish();
}

function executeDependenciesAnalyzer(finished) {
	try{
		info('Loading dependencyAnalyzer.js');
		var depCheck = require('./dependencyAnalyzer/dependencyAnalyzer');
		depCheck(sdkRoot + '/');
	} catch(e) {
		info('dependencyAnalyzer failed: ' + e);
	}
	finished();
}

function copyFileSync(srcFile, destFile) {
	var bytesRead = 1, 
		fdr, fdw, 
		pos = 0,
		BUF_LENGTH = 64 * 1024,
		buff = new Buffer(BUF_LENGTH);
	fdr = fs.openSync(srcFile, 'r');
	fdw = fs.openSync(destFile, 'w');
	while (bytesRead > 0) {
		bytesRead = fs.readSync(fdr, buff, 0, BUF_LENGTH, pos);
		fs.writeSync(fdw, buff, 0, bytesRead);
		pos += bytesRead;
	}
	fs.closeSync(fdr);
	return fs.closeSync(fdw);
}

function copyDirSyncRecursiveEx(sourceDir, newDirLocation) {	
	var checkDir = fs.statSync(sourceDir),
		files;
	try {
		if (!fs.existsSync(newDirLocation)) {
			fs.mkdirSync(newDirLocation, checkDir.mode);
		}
	} catch(e) {
		//if the directory already exists, that's okay
		if (e.code !== 'EEXIST') throw e;
	}

	files = fs.readdirSync(sourceDir);
	for(var i = 0; i < files.length; i++) {
		var currFile = fs.lstatSync(sourceDir + "/" + files[i]);
		if (currFile.isDirectory()) { /*  recursion this thing right on back. */
			copyDirSyncRecursiveEx(sourceDir + "/" + files[i], newDirLocation + "/" + files[i]);
		} else if (currFile.isSymbolicLink()) {
			info('[WARRNING] copyDirSyncRecursiveEx symlink instead of file: ' + sourceDir + "/" + files[i]);
			var symlinkFull = fs.readlinkSync(sourceDir + "/" + files[i]);
			fs.symlinkSync(symlinkFull, newDirLocation + "/" + files[i]);
		} else { /*  At this point, we've hit a file actually worth copying... so copy it on over. */
			copyFileSync(sourceDir + "/" + files[i], newDirLocation + "/" + files[i]);
		}
	}
}

function find7za() {
	var zippath = path.normalize(path.join(path.dirname(require.resolve('node-appc')), '..', 'tools', '7zip', '7za.exe'));
	info('7za.exe detected. Path is ' + path.normalize(zippath));

	if (fs.existsSync(zippath)) {
		return zippath;
	} else {
		info('Cannot find 7za.exe at ' + path.normalize(zippath));
	}
}

function packagingSDK7z(finish) {
	info('Packaging application into zip');
	var packer = require('child_process'),
		child, stdout = '',
		stderr = '';

	child = packer.spawn(path.resolve(find7za().toString()), ['a', resultPath, workingDir + '/*', '-tzip']);
	child.stdout.on('data', function(data) {
		stdout += data.toString();
	});
	child.on('exit', function(code, signal) {
		if (finish) {
			if (code) {
				// if we're on windows, the error message is actually in stdout, so scan for it
				if (runningOnWin32) {
					var foundError = false,
						err = [];

					stdout.split('\n').forEach(function(line) {
						if (/^Error\:/.test(line)) {
							foundError = true;
						}
						if (foundError) {
							line && err.push(line.trim());
						}
					});
					if (err.length) {
						stderr = err.join('\n') + stderr;
					}
				}
				finish();
			} else {
				finish();
			}
		}
	});
}

function unzip7za(src, dest, callback) {
	var packer = require('child_process'),
		child, stdout = '',
		stderr = '';

	child = packer.spawn(path.resolve(find7za().toString()), ['x', src, '-o' + dest, '-y', '-bd']);
	child.stdout.on('data', function(data) {
		stdout += data.toString();
	});
	child.on('exit', function(code, signal) {
		if (callback) {
			if (code) {
				// if we're on windows, the error message is actually in stdout, so scan for it
				if (runningOnWin32) {
					var foundError = false,
						err = [];

					stdout.split('\n').forEach(function(line) {
						if (/^Error\:/.test(line)) {
							foundError = true;
						}
						if (foundError) {
							line && err.push(line.trim());
						}
					});

					if (err.length) {
						stderr = err.join('\n') + stderr;
					}
				}
				callback(null);
			} else {
				callback(null);
			}
		}
	});
}

function packagingSDKLinux(finish) {
	var packer = require('child_process'),
		cmdzip = 'zip -q -r  "' + resultPath + '" *';
	info('zip cmd: ' + cmdzip);
	packer.exec(
	cmdzip, {
		cwd: workingDir
	}, function(err, stdout, stderr) {
		info(stdout);
		if (err != null) {
			//info(stderr);
		} else {
			info('compressing ok');
		}
		finish(null);
	});
}
