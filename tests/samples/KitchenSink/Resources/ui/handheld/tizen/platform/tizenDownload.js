function tizenDownload(title) {
	var messageWin = require('ui/handheld/tizen/tizenToast'),
		downloadId; // we we'll keep it undefined all time we are don't downloading anything

	// simplify similar buttons creation
	function createButton(title, top, clickHandler){
		var result = Titanium.UI.createButton({
			title:title,
			top:top,
			height:39,
			width:"100%"
		});
		result.addEventListener('click', clickHandler);
		return result;
	}

	// simplify similar labels creation
	function createLabel(text, top){
		return Ti.UI.createLabel({
			text:text,
			color:'#000',
			textAlign:'left',
			font:{fontSize:12,fontWeight:'bold'},
			top:top,
			height:'auto',
			width:'auto'
		});
	}

	var win = Ti.UI.createWindow({backgroundColor:'#fff'}),
		urlLabel = createLabel('Type here Url to download:', 10),
		statusLabel = createLabel('Start download to see status...', 290),
		stateLabel = createLabel('Download not started yet.', 330),
		startButton = createButton('start download', 70, function(){startDownload();}),
		pauseButton = createButton('pause download', 110, function(){if (downloadId) tizen.download.pause(downloadId);}),
		resumeButton = createButton('resume download', 150, function(){if (downloadId) tizen.download.resume(downloadId);}),
		stopButton = createButton('stop download', 190, function(){if (downloadId) tizen.download.abort(downloadId);}),
		startButton = createButton('stop download', 190, function(){if (downloadId) tizen.download.abort(downloadId);}),
//		statusButton= createButton('check status', 230, function(){checkState();}),
		urlTextField = Titanium.UI.createTextField({
			value:"http://download.tizen.org/sdk/InstallManager/tizen-sdk-2.0-ubuntu32.bin",
			top:30,
			backgroundColor: 'white',
			color:'black',
			height:39,
			width:'100%',
			borderStyle:Ti.UI.INPUT_BORDERSTYLE_LINE
		});

	win.add(startButton);
	win.add(pauseButton);
	win.add(resumeButton);
	win.add(stopButton);
	//win.add(statusButton);
	win.add(statusLabel);
	win.add(stateLabel);
	win.add(urlLabel);
	win.add(urlTextField);

	checkState();
	return win;

	function startDownload(){
		//listener object must be "local" for call "tizen.download.start". Don't move this declaration it out of this function.
		var listener = {
			onprogress : function(id, receivedSize, totalSize) {
				console.log("'onprogress' event. id=" + id + ", receivedSize=" + receivedSize + ", totalSize=" + totalSize);

				var percentString = (totalSize > 0) ? String.formatDecimal((receivedSize * 100 / totalSize), "##.##" ) + "% " : '';
				statusLabel.text = "Completed " + percentString + '['+receivedSize +'/'+totalSize+' bytes]';
				checkState();
			},
			onpaused : function(id) {
				console.log("'onpaused' event.");
				messageWin.showToast("Download paused. ", 3000);
				checkState();
			},
			onaborted : function(id) {
				console.log("'onaborted' event.");
				messageWin.showToast("Download aborted. ", 3000);
				downloadId = undefined;
				checkState();
			},
			oncompleted : function(id, fileName) {
				console.log("'oncompleted' event.");
				messageWin.showToast("Download completed. Saved to file: "+fileName, 5000);
				downloadId = undefined;
				checkState();
			},
			onfailed : function(id, error) {
				console.log("'onfailed' event.");
				messageWin.showToast("Download failed with error: "+error.name, 3000);
				downloadId = undefined;
				checkState();
			}
		};

		try{
			if (downloadId){
				messageWin.showToast("Please, stop current download before start new one.", 3000);
			}else{
				var urlDownload = new tizen.URLDownload(urlTextField.value, "wgt-private-tmp", "tmp"+(new Date().getTime()));
				statusLabel.text = "Starting...";
				downloadId = tizen.download.start(urlDownload, listener);
				console.log("Download started. downloadId="+downloadId);
				console.log("Download started. State="+tizen.download.getState(downloadId));
			}
		}catch(e) {
			messageWin.showToast("Exception on start download! /n" + e.message, 2500);
		}

		checkState();
	}

	function download(url) {
		console.log('Going to download: ' + url);
		var urlDownload = new tizen.URLDownload(url, "wgt-private-tmp", "tmp"+(new Date().getTime()));
		downloadId = tizen.download.start(urlDownload, listener);
		console.log('Download started: ' + downloadId);
	}

	// checks current download state and updates buttons and messages states according to it.
	function checkState(){
		try{
			// as downloadId has value only on some download in in progress(paused or in progress)
			// we can get basic states from it
			startButton.enabled = !downloadId;
			stopButton.enabled = !!downloadId;

			// state can be: "PAUSED", "DOWNLOADING", "ABORTED", "COMPLETED", "DOWNLOADING", "QUEUED"
			var state = (downloadId)?tizen.download.getState(downloadId):"NONE";
			stateLabel.text = "current download state: " + state;

			pauseButton.enabled = (state == "DOWNLOADING");
			resumeButton.enabled = (state == "PAUSED");
		}catch(e) {
			messageWin.showToast("Exception! " + e.message, 2500);
			// on error reset download and state.
			downloadId = undefined;
			checkState();
		}
	}
};

module.exports = tizenDownload;

