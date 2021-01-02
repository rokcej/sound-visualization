import * as THREE from "../lib/three.module.js"

class App {
	constructor(canvas) {
		window.app = this;
		this.canvas = canvas;
		//this.ctx = canvas.getContext("2d");

		this.canvasSpec = document.getElementById("spectrogram");
		this.ctxSpec = this.canvasSpec.getContext("2d")
		
		this.init();
	}

	getPeaks(buffer) {
		let partLen = buffer.sampleRate / 2;
		let numParts = buffer.length / partLen;


		let l = buffer.getChannelData(0);
		let r = buffer.getChannelData(1);
		let peaks = [];

		for (let i = 0; i < numParts; ++i) {
			let max = { volume: 0, index: 0 };
			for (let j = i * partLen; j < Math.min((i + 1) * partLen, buffer.length); ++j) {
				let volume = (Math.abs(l[j]) + Math.abs(r[j])) * 0.5;
				if (volume > max.volume) {
					max.volume = volume;
					max.index = j;
				}
			}
			peaks.push(max);
		}

		peaks.sort((a, b) => {
			return b.volume - a.volume;
		});
	
		peaks = peaks.splice(0, Math.trunc(peaks.length * 0.5));
	
		peaks.sort((a, b) => {
			return a.index - b.index;
		});

		return peaks;
	}

	getTempo(peaks, buffer) {
		console.log("Getting tempo");

		// [minBPM, maxBPM)
		const minBPM = 90;
		const maxBPM = 180;

		let BPMs = new Map();

		for (let i = 0; i < peaks.length; ++i) {
			for (let j = i + 1; j < Math.min(i + 10, peaks.length); ++j) {
				let BPM = 60 * buffer.sampleRate / (peaks[j].index - peaks[i].index);
				
				while (BPM < minBPM)
					BPM *= 2;
				while (BPM >= maxBPM)
					BPM *= 0.5;

				BPM = Math.round(BPM);

				let offset = (peaks[i].index / buffer.sampleRate) % (60 / BPM);

				if (BPMs.has(BPM)) {
					let el = BPMs.get(BPM);
					++el.count;
					el.offset = ((el.count - 1) * el.offset + offset) / el.count;
				} else {
					BPMs.set(BPM, { count: 0, offset: offset });
				}
			}
		}

		let sorted = [];
		for (let [BPM, el] of BPMs)
			sorted.push({BPM: BPM, count: el.count, offset: el.offset});
		sorted.sort((a, b) => { return b.count - a.count; });
		
		console.log(sorted);


		let BPM = sorted[0].BPM;
		let offset = 0;

		let _peaks = peaks;
		for (let acc = 1; acc <= 3; ++acc) {
			let offs = new Map();
			for (let i = 0; i < _peaks.length; ++i) {
				let off = (_peaks[i].index / buffer.sampleRate) % (60 / BPM);

				off = Math.round(off * Math.pow(10, acc));
				if (offs.has(off)) {
					let el = offs.get(off);
					++el.count;
					el._peaks.push(_peaks[i]);
				} else {
					offs.set(off, { count: 1, _peaks: [_peaks[i]] });
				}
			}
			let maxCount = 0;
			for (let [off, el] of offs) {
				if (el.count > maxCount) {
					offset = off / Math.pow(10, acc);
					maxCount = el.count;
					_peaks = el._peaks;
				}
			}
			// console.log(offs);
			// console.log(offset);
			//console.log(_peaks);
		}

		// let BPM = sorted[0].BPM;
		// let offs = new Map();
		// for (let i = 0; i < _peaks.length; ++i) {
		// 	let off = (_peaks[i].index / buffer.sampleRate) % (60 / bpm);

		// 	off = Math.round(off * 100);
		// 	if (offs.has(off))
		// 		offs.set(off, offs.get(off) + 1);
		// 	else
		// 		offs.set(off, 1);
		// }
		// let offset = 0;
		// let maxCount = 0;
		// for (let [off, count] of offs) {
		// 	if (count > maxCount) {
		// 		offset = off / 100;
		// 		maxCount = count;
		// 	}
		// }

		console.log(offset);
		//console.log(offs);

		return { BPM: BPM, offset: offset };
	}

	beatDetection(buffer) {
		let oac = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
		let source = oac.createBufferSource(buffer);
		source.buffer = buffer;

		let lowpass = oac.createBiquadFilter();
		lowpass.type = "lowpass";
		lowpass.frequency.value = 250;
		lowpass.Q.value = 1;

		var highpass = oac.createBiquadFilter();
		highpass.type = "highpass";
		highpass.frequency.value = 100;
		highpass.Q.value = 1;


		source.connect(lowpass);
		lowpass.connect(highpass);
		highpass.connect(oac.destination);
		//source.connect(oac.destination);

		source.start(0);
		oac.startRendering();

		oac.oncomplete = (e) => {
			buffer = e.renderedBuffer;
			
			// let src = this.ac.createBufferSource();
			// src.buffer = buffer;
			// src.connect(this.analyser);
			// src.connect(this.ac.destination);
			// src.start(0);

			let peaks = this.getPeaks(buffer);
			let tempo = this.getTempo(peaks, buffer);
			this.tempo = tempo;

			console.log(tempo);

			window.requestAnimationFrame(() => { this.update(); });
		};
	}

	loadAudio() {
		let xhr = new XMLHttpRequest();
		xhr.open('GET', this.audio.src, true);
		xhr.responseType = 'arraybuffer';
		xhr.onload = () => {
			this.ac.decodeAudioData(xhr.response, (buffer) => {
				// this.source = this.ac.createBufferSource();
				// this.source.buffer = buffer;

				// this.source.connect(this.analyser);
				// this.source.connect(this.ac.destination);

				// this.canvas.onclick = () => {
				// 	this.source.start(0);
				// }

				this.beatDetection(buffer);
			});
		}
		xhr.send();
	}

	init() {
		// Audio

		this.ac = new AudioContext();
		this.audio = document.getElementById("audio");
		this.audio.volume = 0.1;
		//this.audio = new Audio();

		// this.audio.onplay = () => {
		// 	this.ac.resume();
		// }

		this.analyser = this.ac.createAnalyser();
		this.analyser.fftSize = 64;

		this.loadAudio();

		this.source = this.ac.createMediaElementSource(this.audio);
		this.source.connect(this.analyser);
		this.source.connect(this.ac.destination);

		this.data = new Uint8Array(this.analyser.frequencyBinCount);
		//this.data = new Uint8Array(this.analyser.fftSize);

		this.canvas.onclick = () => {
			this.audio.play();
		}





		// Video

		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(75, this.canvas.width / this.canvas.height, 0.1, 1000);
		this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, preserveDrawingBuffer: true });

		// const geometry = new THREE.BoxGeometry();
		// const material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
		// this.cube = new THREE.Mesh( geometry, material );
		// this.scene.add( this.cube );

		this.ball = new THREE.Mesh(
			new THREE.IcosahedronGeometry(1, 16),
			new THREE.MeshLambertMaterial({ color: 0x22EE88 })
		);
		this.scene.add(this.ball)
		this.ballOutline = new THREE.Mesh(
			new THREE.IcosahedronGeometry(1.01, 16),
			new THREE.MeshBasicMaterial({ color: 0xFFFFFF, wireframe: true, transparent: true, opacity: 0.4 })
		);
		this.scene.add(this.ballOutline)

		this.aLight = new THREE.AmbientLight(0xFFFFFF, 0.4);

		this.pLight = new THREE.PointLight(0xFFFFFF, 1.0)
		this.pLight.position.set(2, 6, -2);

		this.scene.add(this.aLight);
		this.scene.add(this.pLight);

		this.camera.position.z = 5;


		this.bars = [];
		for (let i = 0; i < this.data.length; ++i) {
			let r = 1.6;
			let p = i / (this.data.length - 1);
			let arc = Math.PI * p;

			let x = r * Math.sin(arc);
			let y = -1;
			let z = r * Math.cos(arc);


			//let mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(1 - 0.4 * p + 0.6, 0.7 * p + 0.3 , 0.1 * p) });
			let mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(1, 0.9 * p + 0.1, 0.2 * p + 0.8) });
			let bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.04), mat);
			let bar2 = bar1.clone();

			bar1.position.set(x, y, z);
			bar2.position.set(-x, y, z)
			bar1.rotation.y = arc;
			bar2.rotation.y = -arc;

			this.scene.add(bar1);
			this.scene.add(bar2);

			this.bars.push([bar1, bar2]);
		}

		this.spectrum = [];
		this.avgs = [];
		for (let i = 0; i < 128; ++i) {
			this.spectrum.push(new Uint8Array(this.analyser.frequencyBinCount));
			this.avgs.push(0);
		}


		this.canvasSpec.width = this.spectrum.length;
		this.canvasSpec.height = this.data.length;

		// window.requestAnimationFrame(() => { this.update(); });
	}

	update() {
		// let w = this.canvas.width, h = this.canvas.height;
		// this.ctx.clearRect(0, 0, w, h);

		// this.analyser.getByteFrequencyData(this.data);
		// //this.analyser.getByteTimeDomainData(this.data);

		// this.ctx.fillStyle = "#E22";
		// this.ctx.strokeStyle = "111"
		// this.ctx.lineWidth = 1;

		// let n = this.data.length;
		// let dx = w / n;

		// for (let i = 0; i < n; ++i) {
		// 	let p = (1 - i / (n - 1)) * 0.9 + 0.1;
		// 	this.ctx.fillStyle = "rgb(" + 255 * p + ", " + 64 * p + ", " + 64 * p + ")";
		// 	let dy = h * (this.data[i] / 255);
		// 	this.ctx.fillRect(i * dx, h - dy, dx, dy);
		// 	this.ctx.strokeRect(i * dx, h - dy, dx, dy);
		// }

		//console.log(this.audio.currentTime);


		// if ((this.audio.currentTime - this.tempo.offset) % (60 / this.tempo.BPM) < 0.05)
		// 	console.log("BEAT");

		let beat = (this.audio.currentTime - this.tempo.offset) % (60 / this.tempo.BPM);
		beat /= (60 / this.tempo.BPM);
		beat *= beat;
		beat = 1 - beat;
		//console.log(beat);

		if (Math.trunc((this.audio.currentTime - this.tempo.offset) / (60 / this.tempo.BPM)) % 4 == 3)
			this.renderer.setClearColor(new THREE.Color(beat, beat, beat));
		else
			this.renderer.setClearColor(new THREE.Color(beat, 0, 0));
		
		this.spectrum.unshift(this.spectrum.pop());
		this.data = this.spectrum[0];
		this.avgs.unshift(this.avgs.pop());

		this.analyser.getByteFrequencyData(this.data);

		// for (let i = 7/8*this.data.length; i < 8/8*this.data.length; ++i)
		// 	this.data[i] = 255;

		this.drawSpectrogram();


		let avg = 0;
		for (let i = 0; i < this.data.length; ++i)
			avg += this.data[i];
		avg /= this.data.length * 255;
		this.avgs[0] = avg;



		for (let i = 0; i < this.data.length; ++i) {
			let p = (this.data[i] / 255) * 0.8 + 0.2;
			for (let j = 0; j < 2; ++j) {
				this.bars[i][j].scale.set(1, p, 1);
				this.bars[i][j].position.y = -1 + p/2;
			}
		}

		let r = 3;
		let speed = 0.2;
		let t = performance.now() / 1000;
		this.camera.position.set(
			r * Math.sin(speed * t),
			0.6,
			r * Math.cos(speed * t)
		);
		this.camera.lookAt(0, -0.4, 0);


		this.ballOutline.geometry.vertices.forEach((vertex, i) => {
			if (Number.isNaN(vertex.x) || Number.isNaN(vertex.x) || Number.isNaN(vertex.x))
				return;

			let bassFr = 1.0;
			let treFr = 1.0;

			let phi = Math.atan(vertex.z / vertex.x);
			let theta = Math.atan(Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z) / vertex.y);

			let u = (phi + Math.PI / 2) / (Math.PI);
			let v = (1 - Math.cos(2 * (theta + Math.PI / 2))) / 2;

			if (vertex.x >= 0)
				u = 1 - u;

			if (u < 0 || u > 1 || v < 0 || v > 1)
				console.log(u, v);

			//let sc = this.data[Math.trunc(u * (this.data.length - 1))] / 255;
			let vi = Math.trunc(v * (this.spectrum.length - 1));
			let ui = Math.trunc(u * (this.data.length - 1));

			let sc = this.spectrum[vi][ui] / 255;

            vertex.normalize();
			vertex.multiplyScalar(1 + (0.4 * sc + 0.2) * this.avgs[vi]);
        });
        this.ballOutline.geometry.verticesNeedUpdate = true;
        this.ballOutline.geometry.normalsNeedUpdate = true;
        this.ballOutline.geometry.computeVertexNormals();
		this.ballOutline.geometry.computeFaceNormals();
		

		let ballScale = 1 - avg * 0.3;
		this.ball.scale.set(ballScale, ballScale, ballScale);



		this.renderer.render(this.scene, this.camera);

		window.requestAnimationFrame(() => { this.update(); });
	}

	drawSpectrogram() {
		let pixels = this.ctxSpec.getImageData(0, 0, this.canvasSpec.width, this.canvasSpec.height);
		for (let row = 0; row < pixels.height; ++row) {
			for (let col = 0; col < pixels.width; ++col) {
				let i = col / pixels.width * this.spectrum.length;
				let j = this.spectrum[0].length - 1 - row / pixels.height * this.spectrum[0].length;
				let val = this.spectrum[i][j];
				pixels.data[(row * pixels.width + col) * 4 + 0] = val;
				pixels.data[(row * pixels.width + col) * 4 + 1] = val;
				pixels.data[(row * pixels.width + col) * 4 + 2] = val;
				pixels.data[(row * pixels.width + col) * 4 + 3] = 255;
			}
		}
		this.ctxSpec.putImageData(pixels, 0, 0);
	}
}




document.addEventListener("DOMContentLoaded", () => {
	const canvas = document.getElementById("canvas");
	const app = new App(canvas);
});
