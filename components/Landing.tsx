"use client";
import Link from "next/link";
import {
  Crosshair,
  Command,
  LockKeyhole,
  Mic,
  Workflow,
  Power,
} from "lucide-react";
import CoreVisual from "./CoreVisual";
import { Button } from "./ui/button";
import Brand from "./Brand";
export default function Landing() {
  return (
    <main className="landing">
      <header>
        <Link href="/" aria-label="SCARLET home">
          <Brand />
        </Link>
        <div>
          <Link href="/login">Sign in</Link>
          <Link className="button subtle" href="/register">
            Create account
          </Link>
        </div>
      </header>
      <section className="landing-hero">
        <div className="landing-copy">
          <div className="eyebrow">
            <i /> S.C.A.R.L.E.T. ASSISTANT OS
          </div>
          <h1>
            Intelligence,
            <br />
            <em>on command.</em>
          </h1>
          <p>
            Your private command center for conversations, research, and the
            tools you use every day.
          </p>
          <div className="land-actions">
            <Button asChild tone="primary">
              <Link href="/dashboard">
                <Power size={17} />
                Open command center
              </Link>
            </Button>
            <Link className="button subtle" href="/register">
              Create an account
            </Link>
          </div>
          <small className="land-security">
            <LockKeyhole size={13} /> Isolated workspace · Permission-controlled
            tools
          </small>
        </div>
        <div className="land-core">
          <span className="land-cross tl">+</span>
          <span className="land-cross br">+</span>
          <CoreVisual />
          <div className="land-tag">
            <Crosshair size={14} /> NEURAL INTERFACE
          </div>
        </div>
      </section>
      <section className="land-features">
        {[
          [
            Command,
            "Command workspace",
            "Chat, save a memory, or schedule a reminder.",
          ],
          [
            Mic,
            "Voice interface",
            "Speak with the assistant in a foreground session.",
          ],
          [
            Workflow,
            "Workflow engine",
            "Follow each step and review external actions.",
          ],
        ].map(([Ic, title, desc]: any) => (
          <div key={title}>
            <Ic size={21} />
            <h2>{title}</h2>
            <p>{desc}</p>
          </div>
        ))}
      </section>
      <footer>
        <span>S.C.A.R.L.E.T. / SYSTEMS</span>
        <span>Original assistant platform</span>
      </footer>
    </main>
  );
}
