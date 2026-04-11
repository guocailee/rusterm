import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

type TerminalPanelProps = {
  connected: boolean;
  initialText: string;
  onData?: (value: string) => void;
  onResize?: (cols: number, rows: number) => void;
  registerWriter?: (writer: (chunk: string) => void) => void;
};

export function TerminalPanel({ connected, initialText, onData, onResize, registerWriter }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const bootedTextRef = useRef<string>("");

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: '"SFMono-Regular", ui-monospace, Menlo, monospace',
      fontSize: 13,
      theme: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        cursor: "#58a6ff",
      },
    });
    const fitAddon = new FitAddon();

    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();
    terminalRef.current = terminal;
    fitRef.current = fitAddon;

    registerWriter?.((chunk: string) => {
      terminal.write(chunk);
    });

    if (initialText) {
      terminal.write(initialText.replace(/\n/g, "\r\n"));
      bootedTextRef.current = initialText;
    }

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      onResize?.(terminal.cols, terminal.rows);
    });
    resizeObserver.observe(containerRef.current);

    const dataDisposable = terminal.onData((value) => {
      if (connected) {
        onData?.(value);
      }
    });

    queueMicrotask(() => {
      fitAddon.fit();
      onResize?.(terminal.cols, terminal.rows);
    });

    return () => {
      dataDisposable.dispose();
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [connected, initialText, onData, onResize, registerWriter]);

  useEffect(() => {
    if (!terminalRef.current) return;
    if (initialText === bootedTextRef.current) return;

    const delta = initialText.slice(bootedTextRef.current.length);
    if (!delta) return;

    terminalRef.current.write(delta.replace(/\n/g, "\r\n"));
    bootedTextRef.current = initialText;
  }, [initialText]);

  return <div ref={containerRef} className="terminal-canvas" />;
}
