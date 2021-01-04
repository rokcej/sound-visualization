function getPeaks(buffer) {
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

function getTempo(peaks, buffer) {
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
	}

	return { BPM: BPM, offset: offset };
}

export default function beatDetection(buffer, callback) {
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

	source.start(0);
	oac.startRendering();

	oac.oncomplete = (e) => {
		buffer = e.renderedBuffer;

		let peaks = getPeaks(buffer);
		let tempo = getTempo(peaks, buffer);
		//this.tempo = tempo;

		callback(tempo);
	};
}
