import * as THREE from "../lib/three.module.js"

class App {
	constructor(canvas) {
		window.app = this;
		this.canvas = canvas;
		//this.ctx = canvas.getContext("2d");
		
		this.init();
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
		this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });

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
			new THREE.MeshBasicMaterial({ color: 0xFFFFFF, wireframe: true, transparent: true, opacity: 0.3 })
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
		for (let i = 0; i < 256; ++i) {
			this.spectrum.push(new Uint8Array(this.analyser.frequencyBinCount));
			this.avgs.push(0);
		}

		window.requestAnimationFrame(() => { this.update(); });
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
		



		
		this.spectrum.unshift(this.spectrum.pop());
		this.data = this.spectrum[0];
		this.avgs.unshift(this.avgs.pop());

		this.analyser.getByteFrequencyData(this.data);

		// for (let i = 7/8*this.data.length; i < 8/8*this.data.length; ++i)
		// 	this.data[i] = 255;


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
			0.5,
			r * Math.cos(speed * t)
		);
		this.camera.lookAt(0, -0.5, 0);


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
			vertex.multiplyScalar(1 + sc * (0.8 * this.avgs[vi] + 0.2));
        });
        this.ballOutline.geometry.verticesNeedUpdate = true;
        this.ballOutline.geometry.normalsNeedUpdate = true;
        this.ballOutline.geometry.computeVertexNormals();
        this.ballOutline.geometry.computeFaceNormals();



		this.renderer.render(this.scene, this.camera);

		window.requestAnimationFrame(() => { this.update(); });
	}
}




document.addEventListener("DOMContentLoaded", () => {
	const canvas = document.getElementById("canvas");
	const app = new App(canvas);
});
