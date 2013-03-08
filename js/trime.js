"use strict";

var options = {
	type: "YAPE06",
	fastThreshold: 10,
	laplacianThreshold: 30,
	eigenThreshold: 30,
	hueShift: 0,
	invertLightness: false,
	invertSaturation: false,
	showVideo: false,
    saveImage: function() { saveImage() }
}

//

var gui,imageData;
var img_u8, count, corners;
var featureContext, triangleContext;

var video = document.getElementById('webcam');
var featureCanvas = document.getElementById('features');
var triangleCanvas = document.getElementById('triangles');

//

function init() {

	video.play();

    featureContext = featureCanvas.getContext('2d');
    triangleContext = triangleCanvas.getContext('2d');

    img_u8 = new jsfeat.matrix_t(640, 480, jsfeat.U8_t | jsfeat.C1_t);

    corners = [];
    var i = 640*480;
    while(--i >= 0) corners[i] = new jsfeat.point2d_t(0,0,0,0);

    setupControls();

	compatibility.requestAnimationFrame(animate);  

	$(window).bind('resize', resize);
	resize();
}

//

function setupControls() {
    gui = new dat.GUI();
    var folder;

    folder = gui.addFolder("Feature Detection");
    folder.add(options, "type", ["YAPE06", "YAPE", "Fast"]);
    folder.open();

    folder = gui.addFolder("YAPE06 Settings");
    folder.add(options, "laplacianThreshold", 1, 100);
    folder.add(options, "eigenThreshold", 1, 100);  

    folder = gui.addFolder("Fast Settings");
    folder.add(options, "fastThreshold", 5, 20);

	gui.add(options, "hueShift", 0, 360);
	gui.add(options, "invertSaturation");
	gui.add(options, "invertLightness");

    gui.add(options, "showVideo").onChange(function() {
    	if (options.showVideo) 
    		$("#features").show();
    	else
    		$("#features").hide();
    });

    gui.add(options, "saveImage");

    gui.close();
}

//


function animate() {
    compatibility.requestAnimationFrame(animate);
    if (video.readyState === video.HAVE_ENOUGH_DATA) {

    	featureContext.drawImage(video, 0, 0, 640, 480);
        imageData = featureContext.getImageData(0, 0, 640, 480);

        jsfeat.imgproc.grayscale(imageData.data, img_u8.data);

        //

        if (options.type == "YAPE06") {
            jsfeat.yape06.laplacian_threshold = options.laplacianThreshold;
            jsfeat.yape06.min_eigen_value_threshold = options.eigenThreshold;
            count = jsfeat.yape06.detect(img_u8, corners);
        } else if (options.type == "YAPE") {
            jsfeat.yape.init(featureCanvas.width, featureCanvas.height, 5, 1);
            count = jsfeat.yape.detect(img_u8, corners, 5);
        } else {
            jsfeat.fast_corners.set_threshold(options.fastThreshold);
            count = jsfeat.fast_corners.detect(img_u8, corners,  5);
        }

		//

		var featureData = featureContext.createImageData(imageData.width, imageData.height);
    	featureData.data.set(imageData.data);

        var data_u32 = new Uint32Array(featureData.data.buffer);
        drawCorners(corners, count, data_u32, 640);        
        featureContext.putImageData(featureData, 0, 0);

        //

        drawTriangles();
    }
}

//

function drawTriangles() {

    var triangleCanvas = document.getElementById("triangles"),
    triangleContext = triangleCanvas.getContext("2d")
    triangleContext.clearRect(0, 0, triangleCanvas.width, triangleCanvas.height);

    triangleContext.drawImage(video, 0, 0, 640, 480);

    var vertices = new Array(count + 4);

    var i;
    for ( i = 0; i< count; i++)
        vertices[i] = {x: corners[i].x, y: corners[i].y};

    vertices[i++] =  {x: 0, y: 0};
    vertices[i++] =  {x: triangleCanvas.width, y: 0};
    vertices[i++] =  {x: triangleCanvas.width, y: triangleCanvas.height};
    vertices[i++] =  {x: 0, y: triangleCanvas.height};

    var triangles = triangulate(vertices)

    var i = triangles.length
    while(i) {
        --i;
        var pixel = (triangles[i].centroid().y * triangleCanvas.width + triangles[i].centroid().x) * 4;

        var r = imageData.data[pixel];
        var g = imageData.data[pixel+1];
        var b = imageData.data[pixel+2];
        
        var hsv = rgb2hsl(r,g,b);

        if (options.invertSaturation) hsv.s = 1 - hsv.s;
        if (options.invertLightness) hsv.l = 1 - hsv.l;

		triangleContext.fillStyle= 'hsl(' + (((hsv.h * 360) + options.hueShift ) % 360) + ',' + hsv.s * 100 + '%,' + hsv.l * 100 + '%)';

        triangles[i].draw(triangleContext)
        triangleContext.fill();
    }

}

//

function drawCorners(corners, count, img, step) {
    var pix = (0xff << 24) | (0x00 << 16) | (0xff << 8) | 0x00;
    for(var i=0; i < count; ++i)
    {
        var x = corners[i].x;
        var y = corners[i].y;
        var off = (x + y * step);
        img[off] = pix;
        img[off-1] = pix;
        img[off+1] = pix;
        img[off-step] = pix;
        img[off+step] = pix;
    }

}

// 

function resize (event) {

	var newWidth = window.innerWidth;
	var newHeight = window.innerWidth/triangleCanvas.width * triangleCanvas.height;

	if (newHeight < window.innerHeight) {
		newHeight = window.innerHeight;
		newWidth = window.innerHeight/triangleCanvas.height * triangleCanvas.width;
	}

	$("#triangles").width(newWidth);
	$("#triangles").height(newHeight);

	$("#triangles").css('left', window.innerWidth/2 - newWidth/2  );
	$("#triangles").css('top', window.innerHeight/2 - newHeight/2  );

}

//

function saveImage() {
    triangleCanvas.toBlob(function(blob) {
        saveAs(blob, "trime.png");
    }, "image/png");
}

// http://mjijackson.com/2008/02/rgb-to-hsl-and-rgb-to-hsv-color-model-conversion-algorithms-in-javascript

function rgb2hsl(r, g, b){
    r /= 255, g /= 255, b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;

    if(max == min){
        h = s = 0; // achromatic
    }else{
        var d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch(max){
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return {h:h,s: s,l: l};
}