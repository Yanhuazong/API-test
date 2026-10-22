import Link from "next/link";

const linkStyle = { color: "#075985", fontWeight: 650 };

export default function Home() {
  return (
    <main style={{ maxWidth: 850, margin: "56px auto", padding: "0 24px 48px" }}>
      <p style={{ color: "#0e7490", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>
        Undergraduate API practice
      </p>
      <h1 style={{ fontSize: "clamp(2.5rem, 6vw, 4rem)", lineHeight: 1.04, marginBottom: 16 }}>
        API Investigation
      </h1>
      <p style={{ fontSize: "1.2rem", lineHeight: 1.65, maxWidth: 700 }}>
        Explore a working fictional campus advising API in your browser: use a booking website built on it, then
        send your own requests to every endpoint. Investigate JSON,
        endpoints, data models, validation, authentication, authorization, and who can
        see or change each record—without building a backend.
      </p>
      <section style={{ background: "white", padding: 24, borderRadius: 12, margin: "28px 0" }}>
        <h2>Start here</h2>
        <ol style={{ lineHeight: 1.9 }}>
          <li>Ask your instructor for your private handout file.</li>
          <li>Open the <Link href="/advising">campus advising website</Link>, paste the handout, and book and cancel appointments. Watch the API calls it makes.</li>
          <li>Open the <Link href="/explorer">API explorer</Link> to send your own requests to each endpoint and read the responses.</li>
          <li>Try the <Link href="/graphql">GraphQL explorer</Link> to get the same data a different way.</li>
          <li>Optionally repeat the exercises in Postman, then work through the investigation worksheet.</li>
        </ol>
        <p><strong>Classroom isolation:</strong> Your API key confines requests to one workspace.
          It is a teaching boundary, not a production authentication system.</p>
      </section>
      <nav aria-label="Student resources" style={{ display: "grid", gap: 12 }}>
        <Link style={linkStyle} href="/explorer">API explorer: try every endpoint in your browser</Link>
        <Link style={linkStyle} href="/graphql">GraphQL explorer: the same data, one URL, you choose the fields</Link>
        <Link style={linkStyle} href="/docs/graphql-guide">GraphQL guide</Link>
        <Link style={linkStyle} href="/advising">Campus advising website: a real app built on the API</Link>
        <Link style={linkStyle} href="/docs/build-your-first-requests">Build your first requests in Postman (optional)</Link>
        <Link style={linkStyle} href="/docs/student-api-guide">Student API guide</Link>
        <Link style={linkStyle} href="/docs/student-investigation">Guided investigation worksheet</Link>
        <a style={linkStyle} href="/postman/API_Investigation.postman_collection.json">Postman collection</a>
        <a style={linkStyle} href="/postman/API.postman_environment.json">Postman environment template</a>
      </nav>
      <section aria-labelledby="agent-lab-card" style={{ background: "white", padding: 20, borderRadius: 12, marginTop: 28, border: "1px solid #d5e2ec" }}>
        <p style={{ margin: 0, color: "#0e7490", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>Instructor demo</p>
        <h2 id="agent-lab-card" style={{ margin: "4px 0 8px" }}>
          <Link style={linkStyle} href="/agent">Agent lab</Link>
        </h2>
        <p style={{ margin: 0 }}>Watch an AI assistant use this API through MCP tools, and judge whether it did what it claimed.</p>
      </section>
      <p style={{ color: "#526879", marginTop: 36 }}>All people, services, and records are fictional.</p>
    </main>
  );
}
