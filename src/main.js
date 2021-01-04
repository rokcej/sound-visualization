import * as THREE from "../lib/three.module.js"
import Player from "./player.js"
import beatDetection from "./beat_detection.js"

class App {
	constructor(canvas) {
		window.app = this;
		this.canvas = canvas;
		//this.ctx = canvas.getContext("2d");

		// Time
		this.time = 0;
		// FPS
		this.fpsTime = 0;
		this.fpsCount = 0;

		this.canvasSpec = document.getElementById("spectrogram");
		this.ctxSpec = this.canvasSpec.getContext("2d")

		// Info
		this.fpsElement = document.getElementById("fps");
		this.tempoElement = document.getElementById("tempo");
		this.offsetElement = document.getElementById("offset");

		// Player
		this.player = null;

		this.loaded = false;

		this.init();
		this.resize();

		// Handlers
		window.addEventListener("resize", () => { this.resize(); }, false);
		
	}

	loadAudio(src) {
		let xhr = new XMLHttpRequest();
		xhr.open('GET', src, true);
		xhr.responseType = 'arraybuffer';
		xhr.onload = () => {
			this.ac.decodeAudioData(xhr.response, (buffer) => {
				beatDetection(buffer, (tempo) => {
					this.tempo = tempo;
					this.tempoElement.innerHTML = tempo.BPM;
					this.offsetElement.innerHTML = tempo.offset;

					this.player.set(buffer);

					if (this.loaded)
						this.player.play();
					else
						this.loaded = true;
				});
			});
		}
		xhr.send();
	}

	init() {
		// Audio

		this.ac = new AudioContext();

		this.analyser = this.ac.createAnalyser();
		this.analyser.fftSize = 64;

		
		this.player = new Player(this.ac, [this.ac.destination, this.analyser]);

		this.loadAudio("data/eminem_stan.mp3");

		this.data = new Uint8Array(this.analyser.frequencyBinCount);


		this.canvas.onclick = () => {
			this.player.toggle();
		}

		this.fileInput = document.getElementById("fileInput");
		this.fileInput.addEventListener("change", (e) => {
			this.loadAudio(URL.createObjectURL(this.fileInput.files[0]));
		});

		document.getElementById("play").addEventListener("click", () => { this.player.play(); });
		document.getElementById("pause").addEventListener("click", () => { this.player.pause(); });
		document.getElementById("stop").addEventListener("click", () => { this.player.stop(); });




		// Video

		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(75, this.canvas.width / this.canvas.height, 0.1, 1000);
		this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, preserveDrawingBuffer: true });
		//this.renderer.autoClear = false;


		this.renderTex = [];
		for (let i = 0; i < 2; ++i) {
			this.renderTex.push(new THREE.WebGLMultisampleRenderTarget(this.canvas.width, this.canvas.height, {
				//minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter
				format: THREE.RGBAFormat,
				wrapS: THREE.MirroredRepeatWrapping,
				wrapT: THREE.MirroredRepeatWrapping,
			}));
		}


		this.aLight = new THREE.AmbientLight(0xFFFFFF, 0.4);

		this.pLight = new THREE.PointLight(0xFFFFFF, 1.0)
		this.pLight.position.set(2, 6, -2);

		this.scene.add(this.aLight);
		this.scene.add(this.pLight);

		this.camera.position.z = 6;
		this.camera.position.y = 0.5;
		this.camera.lookAt(0, 0, 0);


		this.bars = [];
		for (let i = 0; i < this.data.length; ++i) {
			let r = 4.0;
			let p = i / (this.data.length - 1) * 0.8;
			let arc = Math.PI * p + Math.PI;

			let x = r * Math.sin(arc);
			let y = -1;
			let z = r * Math.cos(arc);


			//let mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(1 - 0.4 * p + 0.6, 0.7 * p + 0.3 , 0.1 * p) });
			let mat = new THREE.MeshLambertMaterial({
				//color: new THREE.Color(1, 0.9 * p + 0.1, 0.2 * p + 0.8),
				color: new THREE.Color(1, 1, 1),
				opacity: 1.0,
				transparent: true
			});
			let bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1, 0.25), mat);
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
		for (let i = 0; i < 512; ++i) {
			this.spectrum.push(new Uint8Array(this.analyser.frequencyBinCount));
			this.avgs.push(0);
		}


		this.canvasSpec.width = this.spectrum.length;
		this.canvasSpec.height = this.data.length;

		this.setupParticles();
		this.setupBall();
		this.setupBackground();

		let wait = () => {
			if (this.loaded) {
				//this.player.play();
				window.requestAnimationFrame(() => { this.update(); });
			} else {
				setTimeout(wait, 500);
			}
		}
		wait();
	}

	setupBackground() {
		this.bgscene = new THREE.Scene();
		this.bgcamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

		this.bgUni = {
			particleTex: { value: this.renderTex[0].texture },
			ballTex: { value: this.renderTex[1].texture },
			resolution: { value: new THREE.Vector2(this.canvas.width, this.canvas.height) },
			time: { value: 0.0 },
			beat: { value: 0.0 },
			avg:  { value: 0.0 },
			beat_idx: {value: 0 },
		};

		this.quad = new THREE.Mesh(
			new THREE.PlaneBufferGeometry(2, 2, 1, 1),
			new THREE.ShaderMaterial({
				uniforms: this.bgUni,
				vertexShader: document.getElementById('bg_vert').textContent,
				fragmentShader: document.getElementById('bg_frag').textContent,

				vertexColors: true,
				//side: THREE.DoubleSide,
				//side: THREE.BackSide,
				//wireframe: true,
				//transparent: true,
				depthTest: false
			})
		);
		this.bgscene.add(this.quad);
	}

	// https://threejs.org/examples/webgl_buffergeometry_custom_attributes_particles
	setupParticles() {
		const dim = 1000;

		const uv = [];
		const positions = [];

		for (let i = 0; i < dim; ++i) {
			let u = i / dim;
			//let u = ((i / (dim - 1)) * (this.spectrum.length - 1) + 0.5) / this.spectrum.length;
			for (let j = 0; j < dim; ++j) {
				let v = j / dim;
				//let v = ((j / (dim - 1)) * (this.data.length - 1) + 0.5) / this.data.length;
				uv.push(u, v);
				positions.push(0, 0, 0);
			}
		}

		let geo = new THREE.BufferGeometry();
		geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
		geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));


		this.specTexData = new Uint8Array(this.spectrum.length * this.data.length).fill(0);
		this.specTex = new THREE.DataTexture(this.specTexData, this.spectrum.length, this.data.length, THREE.RedFormat);
		this.specTex.magFilter = THREE.LinearFilter;
		this.specTex.minFilter = THREE.LinearFilter;
		this.specTex.wrapS = THREE.RepeatWrapping;
		this.specTex.wrapT = THREE.RepeatWrapping;
		this.specOff = 0;

		this.avgTexData = new Uint8Array(this.spectrum.length).fill(0);
		this.avgTex = new THREE.DataTexture(this.avgTexData, this.spectrum.length, 1, THREE.RedFormat);
		this.avgTex.magFilter = THREE.LinearFilter;
		this.avgTex.minFilter = THREE.LinearFilter;
		this.avgTex.wrapS = THREE.RepeatWrapping;
		this.avgTex.wrapT = THREE.RepeatWrapping;

		this.particlesUni = {
			specTex: { value: this.specTex },
			avgTex: { value: this.avgTex },
			specOff: { value: 0 },
			uvDim: { value: new THREE.Vector2(this.spectrum.length, this.data.length) },
			time: { value: 0 }
		};

		let mat = new THREE.ShaderMaterial({
			uniforms: this.particlesUni,
			vertexShader: document.getElementById('particles_vert').textContent,
			fragmentShader: document.getElementById('particles_frag').textContent,

			blending: THREE.AdditiveBlending,
			depthTest: false,
			transparent: true,
			vertexColors: true
		});

		let particles = new THREE.Points(geo, mat);
		particles.position.y = -8;

		let particles2 = new THREE.Points(geo, mat);
		particles2.position.y = 8;
		particles2.scale.y = -1;

		particles.frustumCulled = false;
		particles2.frustumCulled = false;

		//this.scene.add(particles);

		this.pscene = new THREE.Scene();
		this.pscene.add(particles);
		this.pscene.add(particles2);

	}

	setupBall() {
		this.ballUni = {
			time: { value: 0.0 },
			beat: { value: 0.0 },
			avg:  { value: 0.0 },
			beat_idx: {value: 0 },
		};
		this.ball = new THREE.Mesh(
			new THREE.IcosahedronGeometry(1, 12),
			new THREE.ShaderMaterial({
				uniforms: this.ballUni,
				vertexShader: document.getElementById('ball_vert').textContent,
				fragmentShader: document.getElementById('ball_frag').textContent,

				vertexColors: true,
				//side: THREE.DoubleSide,
				//side: THREE.BackSide,
				wireframe: true,
				transparent: true,
			})
		);
		this.scene.add(this.ball);

		this.ball2 = new THREE.Mesh(
			this.ball.geometry,
			new THREE.ShaderMaterial({
				uniforms: this.ballUni,
				vertexShader: document.getElementById('ball_vert').textContent,
				fragmentShader: document.getElementById('ball2_frag').textContent,

				vertexColors: true,
				//side: THREE.DoubleSide,
				//side: THREE.BackSide,
				//wireframe: true,
				transparent: true
			})
		);
		this.scene.add(this.ball2);
	}

	update() {
		// Timer
		this.time = performance.now() * 0.001;

		// FPS
		++this.fpsCount;
		if (this.time - this.fpsTime >= 1.0) {
			const fps = this.fpsCount / (this.time - this.fpsTime);
			this.fpsElement.innerHTML = Math.round(fps).toString();

			this.fpsCount = 0;
			this.fpsTime = this.time;
		}


		let beat = (this.player.getTime() - this.tempo.offset) % (60 / this.tempo.BPM);
		beat *= this.tempo.BPM / 60.0;
		beat *= beat;
		beat = 1 - beat;
		//console.log(beat);

		let beat_idx = Math.trunc((this.player.getTime() - this.tempo.offset) / (60 / this.tempo.BPM));

		// if (Math.trunc((this.audio.currentTime - this.tempo.offset) / (60 / this.tempo.BPM)) % 4 == 3)
		// 	this.renderer.setClearColor(new THREE.Color(beat, beat, beat));
		// else
		// 	this.renderer.setClearColor(new THREE.Color(beat, 0, 0));
		
		this.spectrum.unshift(this.spectrum.pop());
		this.data = this.spectrum[0];
		this.avgs.unshift(this.avgs.pop());

		this.analyser.getByteFrequencyData(this.data);




		let avg = 0;
		for (let i = 0; i < this.data.length; ++i)
			avg += this.data[i];
		avg /= this.data.length * 255.0;
		this.avgs[0] = avg;




		for (let i = 0; i < this.data.length; ++i) {
			this.specTexData[this.specOff + i * this.spectrum.length] = this.data[i];
		}
		this.avgTexData[this.specOff] = Math.trunc(avg * 255);

		this.specOff = (this.specOff + 1) % this.spectrum.length;
		this.particlesUni.specOff.value = this.specOff / this.spectrum.length;
		this.particlesUni.time.value = this.time;
		this.specTex.needsUpdate = true;
		this.avgTex.needsUpdate = true;

		this.ballUni.time.value = this.time;
		this.ballUni.avg.value = avg;
		this.ballUni.beat.value = beat;
		this.ballUni.beat_idx.value = beat_idx;

		this.bgUni.time.value = this.time;
		this.bgUni.avg.value = avg;
		this.bgUni.beat.value = beat;
		this.bgUni.beat_idx.value = beat_idx;

		// for (let i = 7/8*this.data.length; i < 8/8*this.data.length; ++i)
		// 	this.data[i] = 255;

		this.drawSpectrogram();



		for (let i = 0; i < this.data.length; ++i) {
			let p = this.data[i] / 255;
			let sc = 2 * p + 0.1;
			for (let j = 0; j < 2; ++j) {
				this.bars[i][j].scale.set(1, sc, 1);
				this.bars[i][j].position.y = -1 + sc/2;
				this.bars[i][j].material.opacity = Math.sqrt(p) * 0.9 + 0.1;
				this.bars[i][j].material.color.setRGB(1, 1 - p, 1 - p);
			}
		}

		let rotSpeed = this.tempo.BPM / 180;
		this.ball.rotation.set(
			Math.sin(this.time * rotSpeed) * 0.5,
			-this.time * rotSpeed,
			0
		);
		this.ball2.rotation.set(
			Math.sin(this.time * rotSpeed) * 0.5,
			-this.time * rotSpeed,
			0
		);


		// this.renderer.clear();
		// this.renderer.render(this.bgscene, this.bgcamera);
		// this.renderer.render(this.pscene, this.camera);
		// this.renderer.render(this.scene, this.camera);

		
		this.renderer.setRenderTarget(this.renderTex[0]);
		this.renderer.render(this.pscene, this.camera);
		this.renderer.setRenderTarget(this.renderTex[1]);
		this.renderer.render(this.scene, this.camera);
		this.renderer.setRenderTarget(null);
		this.renderer.render(this.bgscene, this.bgcamera);

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

	resize() {
		this.canvas.width  = window.innerWidth;
		this.canvas.height = window.innerHeight;

		this.camera.aspect = this.canvas.width / this.canvas.height;
		this.camera.updateProjectionMatrix();
		
		this.renderer.setSize(this.canvas.width, this.canvas.height);

		for (let rt of this.renderTex)
			rt.setSize(this.canvas.width, this.canvas.height);

		if (this.bgUni)
			this.bgUni.resolution.value.set(this.canvas.width, this.canvas.height);
	}
}




document.addEventListener("DOMContentLoaded", () => {
	const canvas = document.getElementById("canvas");
	const app = new App(canvas);
});
