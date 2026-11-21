"use client";

import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Captions,
  Headphones,
  Mic,
  MicOff,
  Radio,
  Send,
  SlidersHorizontal,
  Square,
  Volume2,
} from "lucide-react";
import CoreVisual, { type CoreState } from "./CoreVisual";
import "./voice.css";

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface Recognizer {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<RecognitionResult>;
      }) => void)
    | null;
  start(): void;
  abort(): void;
}
type VoiceWindow = Window & {
  SpeechRecognition?: new () => Recognizer;
  webkitSpeechRecognition?: new () => Recognizer;
  webkitAudioContext?: typeof AudioContext;
};
type Phase = CoreState | "opening";
type VoiceOptions = {
  wake: boolean;
  muted: boolean;
  spoken: boolean;
  language: string;
  voice: string;
};
type Meter = { stream?: MediaStream; context?: AudioContext; frame?: number };
export interface VoiceConsoleProps {
  onCommand: (text: string) => Promise<string>;
}

const languages = [
  ["en-US", "English (US)"],
  ["en-GB", "English (UK)"],
  ["en-IN", "English (India)"],
  ["hi-IN", "हिन्दी"],
  ["es-ES", "Español"],
  ["fr-FR", "Français"],
  ["de-DE", "Deutsch"],
  ["ja-JP", "日本語"],
  ["pt-BR", "Português"],
  ["zh-CN", "中文"],
];
const initialOptions: VoiceOptions = {
  wake: false,
  muted: false,
  spoken: true,
  language: "en-US",
  voice: "",
};
const wakePrefix = /^\s*(?:hey[\s,]+scarlett?)\b[\s,.:;!?-]*/i;
const phaseLabel: Record<Phase, string> = {
  idle: "Standby",
  opening: "Opening microphone",
  listening: "Listening",
  thinking: "Processing command",
  speaking: "Speaking",
  executing: "Executing",
  error: "Attention required",
};
const recognitionErrors: Record<string, string> = {
  "not-allowed":
    "Microphone or speech access was denied. Allow access in your browser’s site settings, then try again.",
  "service-not-allowed":
    "Your browser’s speech service is unavailable. Type your command below.",
  "audio-capture":
    "No microphone is available. Connect one, check the system input, or type below.",
  network:
    "The browser speech service could not connect. Check your connection or type your command.",
  "no-speech":
    "No speech was detected. Start another session or type your command below.",
  "language-not-supported":
    "The speech service could not recognize this language. Try another language or type below.",
};

function releaseMeter(meter: Meter) {
  if (meter.frame !== undefined) cancelAnimationFrame(meter.frame);
  meter.stream?.getTracks().forEach((track) => track.stop());
  if (meter.context && meter.context.state !== "closed")
    void meter.context.close().catch(() => undefined);
}

function recognitionConstructor() {
  const browser = window as VoiceWindow;
  return browser.SpeechRecognition || browser.webkitSpeechRecognition;
}

export function VoiceConsole({ onCommand }: VoiceConsoleProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [options, setOptions] = useState(initialOptions);
  const [capabilities, setCapabilities] = useState<{
    input: boolean;
    output: boolean;
  } | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [typed, setTyped] = useState("");
  const [interim, setInterim] = useState("");
  const [lastInput, setLastInput] = useState("");
  const [reply, setReply] = useState("");
  const [message, setMessage] = useState("");
  const [level, setLevel] = useState(0);
  const [armed, setArmed] = useState(false);
  const session = useRef(0);
  const mounted = useRef(false);
  const busy = useRef(false);
  const recognition = useRef<Recognizer | null>(null);
  const meter = useRef<Meter>({});
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const liveOptions = useRef(options);
  const submit = useRef(onCommand);
  const restart = useRef<() => void>(() => undefined);
  const resumeWake = useRef(false);
  const speechTimer = useRef<number | undefined>(undefined);

  function configure<K extends keyof VoiceOptions>(
    key: K,
    value: VoiceOptions[K],
  ) {
    const next = { ...liveOptions.current, [key]: value };
    liveOptions.current = next;
    setOptions(next);
  }

  function detachInput() {
    session.current++;
    const engine = recognition.current;
    recognition.current = null;
    if (engine) {
      engine.onend = null;
      engine.onerror = null;
      engine.onresult = null;
      engine.onstart = null;
      try {
        engine.abort();
      } catch {
        /* It may already have ended. */
      }
    }
    releaseMeter(meter.current);
    meter.current = {};
    setLevel(0);
    setArmed(false);
    setInterim("");
  }

  function interruptPlayback() {
    const active = utterance.current;
    if (active) {
      active.onend = null;
      active.onerror = null;
      active.onboundary = null;
      utterance.current = null;
      window.speechSynthesis?.cancel();
    }
    window.clearTimeout(speechTimer.current);
    setLevel(0);
  }

  function stop() {
    resumeWake.current = false;
    detachInput();
    interruptPlayback();
    if (!busy.current) setPhase("idle");
  }

  useEffect(() => {
    mounted.current = true;
    const synth = window.speechSynthesis;
    setCapabilities({
      input: !!recognitionConstructor() && window.isSecureContext,
      output: !!synth,
    });
    const loadVoices = () => setVoices(synth?.getVoices() || []);
    loadVoices();
    synth?.addEventListener("voiceschanged", loadVoices);
    const visibility = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted.current = false;
      stop();
      synth?.removeEventListener("voiceschanged", loadVoices);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  useEffect(() => {
    submit.current = onCommand;
  }, [onCommand]);

  async function startMeter(token: number) {
    if (!navigator.mediaDevices?.getUserMedia) return;
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (token !== session.current || !mounted.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const Audio =
        window.AudioContext || (window as VoiceWindow).webkitAudioContext;
      if (!Audio) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const context = new Audio();
      const current: Meter = { stream, context };
      meter.current = current;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      await context.resume();
      const data = new Uint8Array(analyser.fftSize);
      let lastFrame = 0;
      const sample = (now: number) => {
        if (token !== session.current || !mounted.current) return;
        if (now - lastFrame > 65) {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (const item of data) sum += ((item - 128) / 128) ** 2;
          const rms = Math.sqrt(sum / data.length);
          setLevel(Math.min(1, Math.max(0, rms - 0.009) * 7.5));
          lastFrame = now;
        }
        current.frame = requestAnimationFrame(sample);
      };
      if (token === session.current)
        current.frame = requestAnimationFrame(sample);
    } catch {
      // Recognition may still run when the browser restricts a parallel level meter.
      stream?.getTracks().forEach((t) => t.stop());
      if (token === session.current) {
        releaseMeter(meter.current);
        meter.current = {};
      }
    }
  }

  function finishTurn() {
    setPhase("idle");
    setLevel(0);
    if (
      resumeWake.current &&
      liveOptions.current.wake &&
      !liveOptions.current.muted &&
      !document.hidden
    )
      restart.current();
  }

  async function runCommand(text: string) {
    const command = text.trim();
    if (!command || busy.current) return;
    busy.current = true;
    detachInput();
    interruptPlayback();
    setLastInput(command);
    setReply("");
    setMessage("");
    setPhase("thinking");
    setTyped("");
    try {
      const answer = await submit.current(command);
      if (!mounted.current) return;
      setReply(answer);
      const settings = liveOptions.current;
      if (
        !answer ||
        !settings.spoken ||
        !window.speechSynthesis ||
        document.hidden
      ) {
        busy.current = false;
        finishTurn();
        return;
      }
      const speech = new SpeechSynthesisUtterance(answer);
      speech.lang = settings.language;
      speech.voice =
        window.speechSynthesis
          .getVoices()
          .find((v) => v.voiceURI === settings.voice) ?? null;
      utterance.current = speech;
      speech.onboundary = () => {
        setLevel(0.68);
        window.clearTimeout(speechTimer.current);
        speechTimer.current = window.setTimeout(() => setLevel(0.12), 135);
      };
      speech.onend = () => {
        utterance.current = null;
        window.clearTimeout(speechTimer.current);
        finishTurn();
      };
      speech.onerror = () => {
        utterance.current = null;
        window.clearTimeout(speechTimer.current);
        resumeWake.current = false;
        setLevel(0);
        setMessage(
          "Your reply is available below. Audio playback could not complete.",
        );
        setPhase("error");
      };
      busy.current = false;
      setPhase("speaking");
      window.speechSynthesis.speak(speech);
    } catch (error) {
      if (mounted.current) {
        resumeWake.current = false;
        setPhase("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "The command could not complete. Please try again.",
        );
      }
    } finally {
      busy.current = false;
    }
  }

  function startListening() {
    if (busy.current || liveOptions.current.muted || document.hidden) return;
    const Engine = recognitionConstructor();
    if (!Engine || !window.isSecureContext) {
      setMessage(
        "Speech input is unavailable in this browser. Type your command below.",
      );
      return;
    }
    detachInput();
    interruptPlayback();
    setMessage("");
    const token = session.current;
    const engine = new Engine();
    recognition.current = engine;
    const useWake = liveOptions.current.wake;
    resumeWake.current = useWake;
    let waiting = useWake;
    engine.lang = liveOptions.current.language;
    engine.continuous = useWake;
    engine.interimResults = true;
    engine.onstart = () => {
      if (token !== session.current) return;
      setPhase("listening");
      void startMeter(token);
    };
    engine.onresult = (event) => {
      if (token !== session.current) return;
      const changed = Array.from(event.results).slice(event.resultIndex);
      setInterim(
        changed
          .map((r) => r[0].transcript)
          .join(" ")
          .trim(),
      );
      let text = changed
        .filter((r) => r.isFinal)
        .map((r) => r[0].transcript)
        .join(" ")
        .trim();
      if (!text) return;
      if (waiting) {
        if (!wakePrefix.test(text)) {
          setInterim("");
          return;
        }
        waiting = false;
        setArmed(true);
        text = text.replace(wakePrefix, "").trim();
      }
      if (text) void runCommand(text);
    };
    engine.onerror = ({ error }) => {
      if (token !== session.current) return;
      resumeWake.current = false;
      detachInput();
      setPhase("error");
      setMessage(
        recognitionErrors[error] ||
          "Speech recognition was interrupted. Start another session or type below.",
      );
    };
    engine.onend = () => {
      if (token !== session.current) return;
      resumeWake.current = false;
      detachInput();
      setPhase("idle");
      setMessage(
        "The microphone session ended. Start listening to open it again.",
      );
    };
    setPhase("opening");
    try {
      engine.start();
    } catch {
      stop();
      setPhase("error");
      setMessage(
        "Could not open the microphone. Check site permissions and try again.",
      );
    }
  }

  useEffect(() => {
    restart.current = startListening;
  });

  const listening = phase === "listening" || phase === "opening";
  const canHear = capabilities?.input === true;
  const voiceChoices = voices.filter(
    (v) =>
      v.lang.split(/[-_]/)[0].toLowerCase() === options.language.split("-")[0],
  );
  const heading =
    phase === "listening" && options.wake
      ? armed
        ? "Say your command"
        : "Awaiting wake phrase"
      : phaseLabel[phase];
  return (
    <section className="scarlet-voice" aria-label="Voice console">
      <div className="sv-instrument">
        <div className="sv-instrument-bar">
          <span>
            <Radio size={15} /> Voice channel
          </span>
          <span>
            <i className={"sv-indicator sv-" + phase} />
            {phaseLabel[phase]}
          </span>
        </div>
        <div className="sv-stage">
          <CoreVisual
            state={phase === "opening" ? "idle" : phase}
            level={level}
          />
        </div>
        <div className="sv-console-panel">
          <span className="sv-eyebrow">
            <Headphones size={14} /> Audio link
          </span>
          <h2 role="status">{heading}</h2>
          <p>
            {interim ||
              (listening && options.wake && !armed
                ? "Say “Hey Scarlet”, followed by a command."
                : phase === "listening"
                  ? "Speak naturally. Your command will appear here."
                  : phase === "thinking"
                    ? "Waiting for the command response."
                    : phase === "speaking"
                      ? "Start listening to interrupt playback."
                      : "Open the microphone to speak with Scarlet.")}
          </p>
          <div className="sv-actions">
            <button
              className="sv-primary"
              disabled={!canHear || options.muted || phase === "thinking"}
              onClick={() => (listening ? stop() : startListening())}
            >
              {listening ? <Square size={15} /> : <Mic size={17} />}
              {listening ? "Stop listening" : "Start listening"}
            </button>
            {phase === "speaking" ? (
              <button className="sv-plain" onClick={stop}>
                <Square size={14} />
                Stop playback
              </button>
            ) : (
              <button
                className="sv-plain"
                aria-pressed={options.muted}
                disabled={!canHear}
                onClick={() => {
                  if (!options.muted) stop();
                  configure("muted", !options.muted);
                }}
              >
                {options.muted ? <Mic size={16} /> : <MicOff size={16} />}
                {options.muted ? "Unmute input" : "Mute input"}
              </button>
            )}
          </div>
        </div>
      </div>
      {message && (
        <p className="sv-notice" role={phase === "error" ? "alert" : "status"}>
          {message}
        </p>
      )}
      {capabilities && !canHear && (
        <p className="sv-notice">
          Speech input is unavailable in this browser. You can type a command
          below. Microphone input requires a supported browser on HTTPS or
          localhost.
        </p>
      )}
      <div className="sv-lower">
        <div className="sv-section">
          <h3>
            <SlidersHorizontal size={18} />
            Voice settings
          </h3>
          <div className="sv-selects">
            <label>
              Language
              <select
                value={options.language}
                disabled={listening}
                onChange={(e) => {
                  configure("language", e.target.value);
                  configure("voice", "");
                }}
              >
                {languages.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Playback voice
              <select
                value={options.voice}
                disabled={!capabilities?.output}
                onChange={(e) => configure("voice", e.target.value)}
              >
                <option value="">Device default</option>
                {voiceChoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="sv-check">
            <Volume2 size={16} />
            <span>Read replies aloud</span>
            <input
              type="checkbox"
              disabled={!capabilities?.output}
              checked={!!capabilities?.output && options.spoken}
              onChange={(e) => {
                configure("spoken", e.target.checked);
                if (!e.target.checked && phase === "speaking") {
                  interruptPlayback();
                  finishTurn();
                }
              }}
            />
          </label>
          <label className="sv-check">
            <AudioLines size={16} />
            <span>Wake phrase “Hey Scarlet”</span>
            <input
              type="checkbox"
              disabled={!canHear || listening || phase === "thinking"}
              checked={options.wake}
              onChange={(e) => {
                configure("wake", e.target.checked);
                if (!e.target.checked) resumeWake.current = false;
              }}
            />
          </label>
          <p className="sv-hint">
            Wake listening starts when you open the microphone and stops when
            this tab is hidden. Your browser may use its online speech service.
          </p>
        </div>
        <div className="sv-section">
          <h3>
            <Captions size={18} />
            Session transcript
          </h3>
          <div className="sv-transcript" aria-live="polite">
            {lastInput ? (
              <>
                <span>You</span>
                <p>{lastInput}</p>
                {reply && (
                  <>
                    <span>Scarlet</span>
                    <p>{reply}</p>
                  </>
                )}
              </>
            ) : (
              <p>Your spoken or typed exchange will appear here.</p>
            )}
          </div>
          <form
            className="sv-compose"
            onSubmit={(e) => {
              e.preventDefault();
              void runCommand(typed);
            }}
          >
            <input
              aria-label="Typed voice command"
              placeholder="Type a command…"
              value={typed}
              maxLength={8000}
              onChange={(e) => setTyped(e.target.value)}
            />
            <button
              type="submit"
              aria-label="Send typed command"
              disabled={!typed.trim() || phase === "thinking"}
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

export default VoiceConsole;
