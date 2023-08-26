import Essentia from 'https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-core.es.js';
import { EssentiaWASM } from 'https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.es.js';

// Initialize Essentia
const essentia = new Essentia(EssentiaWASM);

export class AudioHandler {
        constructor() {
          this.audioContext = new AudioContext({sampleRate: 44100});
          this.fft = new p5.FFT();
          this.mic = new p5.AudioIn();
          this.micEnabled = false;
          this.songEnabled = false;
          this.song = null;
          };
        
        loadSong(filePath) {
          this.song = loadSound(filePath);
        }

        toggleMic() {
          this.micEnabled = !this.micEnabled;
          if (this.micEnabled) this.mic.start();
          else this.mic.stop();
        }

        toggleSong() {
            if (this.song.isPlaying()) {
              this.song.pause();
            } else {
              this.song.loop();
            }
          }
          
          
      
        async setupAudioWorklet() {
          try {
            await this.audioContext.audioWorklet.addModule('essentia-worklet-processor.js');
            this.essentiaNode = new AudioWorkletNode(this.audioContext, 'essentia-worklet-processor');
            this.essentiaNode.onprocessorerror = (e) => {
            console.log(`Error from processor: ${e.message}`);
            };
      
            this.essentiaNode.port.onmessage = (e) => {
            const rms = e.data;
            // Use `rms` for visualization
            };
      
          } catch (e) {
            console.error(`Error setting up audio worklet: ${e.message}`);
          }
        }
      
        async setupMicrophone() {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.microphone = this.audioContext.createMediaStreamSource(stream);
        this.microphone.connect(this.essentiaNode);
        this.essentiaNode.connect(this.audioContext.destination);
      }
      
        analyzeWithEssentia(audioSignal) {
          if (audioSignal) {
            let essentiaInput = essentia.arrayToVector(audioSignal);
            let rhythm = essentia.RhythmExtractor2013(essentiaInput);
            let bpm = rhythm.bpm;
            return bpm;
          }   else {
            console.error("Audio signal is not defined.");
            return null;
        }
      }
    }
