function xhr_xml() {
	var self = Ti.UI.createWindow();
	var xhr = Titanium.Network.createHTTPClient();
	
	xhr.onload = function()
	{
		Ti.API.info('www.w3schools.com/xml/note.xml ' + this.responseXML + ' text ' + this.responseText);
			
		var textarea = Ti.UI.createTextArea({borderRadius:5,borderWidth:2,borderColor:'#999',backgroundColor:'#111',color:'yellow',bottom:10,left:10,right:10,height:300,font:{fontFamily:'courier',fontSize:10}});
		textarea.value = this.responseText;
		self.add(textarea);
	};
	
	xhr.onerror = function(e) {
		Ti.API.info('error:'+e.error);
	}
	
	// open the client
	xhr.open('GET','http://www.w3schools.com/xml/note.xml');
	
	// send the data
	xhr.send();
	
	return self;
};

module.exports = xhr_xml;