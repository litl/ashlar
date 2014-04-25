// Copyright 2014 litl, LLC. All Rights Reserved.

var getFullWidth = function() {
	return Math.max(document.documentElement["clientWidth"], document.body["scrollWidth"], document.documentElement["scrollWidth"], document.body["offsetWidth"], document.documentElement["offsetWidth"]);
}


var fitContainer = function(container, tiles, top) {
    last = tiles[tiles.length - 1];
    container.style.height = last.y + last.height + top;
    container.style.width = last.x + last.width;
};

var placeTiles = function(divs, tiles, top) {
    for (var i=0 ; i < divs.length ; i++) {
        var div = divs[i];
        var tile = tiles[i];
        div.style.left = tile.x;
        div.style.top = tile.y + top;
        div.style.width = tile.width;
        div.style.height = tile.height;
        div.style.position = 'absolute';
        tile.img.setAttribute('width', tile.width);
        tile.img.setAttribute('height', tile.height);
        div.appendChild(tile.img);
    }
};

var layoutContainer = function(container, divs, photos, width, chunkSize) {
    var top = 0;
    for (var i=0 ; i < divs.length ; i += chunkSize) {
        var photoChunk = photos.slice(i, i + chunkSize);
        var divChunk = [];
        for (var j=0; j < chunkSize && i + j < divs.length ; j++) {
            divChunk.push(divs[i + j]);
        }

        tiles = ashlar.layout(photoChunk, width);
        fitContainer(container, tiles, top);
        placeTiles(divChunk, tiles, top);

        var last = tiles[tiles.length - 1];
        top += last.y + last.height;
    }
}

var initContainer = function(selector, options) {
	var container = document.querySelector(selector);
	var divs = container.querySelectorAll(selector + ' > div' + options.photoSelector);
	var photos = [];

	var loadCt = 0;
	function imageLoad() {
		loadCt++;

		var idx = Number(this.getAttribute("data-idx"));
		this.removeAttribute("data-idx");
		photos[idx] = {
			img: this,
			aspect: this.height / this.width,
			priority: 1
		};

		if (loadCt === divs.length){
			layoutContainer(container, divs, photos, options.width || getFullWidth(), options.chunkSize || 3);
		}
	}

	for (var i=0 ; i < divs.length ; i++) {
		var url = divs[i].getAttribute('data-src');
		divs[i].removeAttribute('data-src');
		var img = new Image();
		img.setAttribute("data-idx", i);
		img.onload = imageLoad;
		img.src = url;
	}
};
