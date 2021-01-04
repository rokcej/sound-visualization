export default class Player {
	constructor(audioContext, outputs) {
		this.ac = audioContext;
		this.outputs = outputs;

		this.isPlaying = false;
		this.startedAt = 0;
		this.pausedAt = 0;
		this.buffer = null;
		this.source = null;
	}

	getTime() {
		if (this.isPlaying)
			return this.ac.currentTime - this.startedAt;
		else
			return this.pausedAt - this.startedAt;
	}

	set(buffer) {
		this.stop();
		this.buffer = buffer;
	}

	toggle() {
		if (this.isPlaying)
			this.pause();
		else
			this.play();
	}

	play() {
		if (!this.isPlaying && this.buffer) {
			let offset = this.pausedAt;

			this.source = this.ac.createBufferSource()
			this.source.buffer = this.buffer;

			for (let output of this.outputs)
				this.source.connect(output);
			this.source.start(0, offset);

			this.startedAt = this.ac.currentTime - offset;
			this.pausedAt = 0;
			this.isPlaying = true;
		}
	}

	pause() {
		if (this.isPlaying) {
			let elapsed = this.ac.currentTime - this.startedAt;
			this.stop();
			this.pausedAt = elapsed;
		}
	}

	stop() {
		if (this.source) {
			this.source.disconnect();
			this.source.stop();
			this.source = null;
		}
		this.pausedAt = 0;
		this.startedAt = 0;
		this.isPlaying = false
	}
}
