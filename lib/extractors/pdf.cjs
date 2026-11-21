// Separate process keeps the PDF parser's heap and execution time bounded by its caller.
const { PDFParse } = require("pdf-parse");

async function read() {
  const chunks = [];
  for await (const bytes of process.stdin) chunks.push(bytes);
  const parser = new PDFParse({
    data: new Uint8Array(Buffer.concat(chunks)),
    verbosity: 0,
    isEvalSupported: false,
    enableXfa: false,
    useSystemFonts: false,
    useWorkerFetch: false,
    stopAtErrors: true,
  });
  try {
    const result = await parser.getText({ first: 40, pageJoiner: "" });
    process.stdout.write(
      JSON.stringify(
        result.pages
          .map((page) => page.text)
          .join("\n\n")
          .slice(0, 120000),
      ),
    );
  } finally {
    await parser.destroy();
  }
}
read().catch(() => {
  process.exitCode = 1;
});
