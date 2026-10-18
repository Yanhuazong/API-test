import Link from "next/link";

const linkStyle = { color: "#075985", fontWeight: 650 };

export default function Home() {
  return (
    <main style={{ maxWidth: 850, margin: "56px auto", padding: "0 24px 48px" }}>
      <p style={{ color: "#0e7490", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>
        Undergraduate API practice
      </p>
      <h1 style={{ fontSize: "clamp(2.5rem, 6vw, 4rem)", lineHeight: 1.04, marginBottom: 16 }}>
        API Investigation Lab
      </h1>
      <p style={{ fontSize: "1.2rem", lineHeight: 1.65, maxWidth: 700 }}>
        Explore a working fictional campus advising API with Postman. Investigate JSON,
        endpoints, data models, validation, authentication, authorization, and who can
        see or change each record—without building a backend.
      </p>
      <section style={{ background: "white", padding: 24, borderRadius: 12, margin: "28px 0" }}>
        <h2>Start here</h2>
        <ol style={{ lineHeight: 1.9 }}>
          <li>Ask your instructor for the private credentials for your assigned workspace.</li>
          <li>Import the Postman collection and environment; set the supplied credentials locally.</li>
          <li>Read the API guide, then work through the investigation worksheet.</li>
        </ol>
        <p><strong>Classroom isolation:</strong> Your lab key confines requests to one workspace.
          It is a teaching boundary, not a production authentication system.</p>
      </section>
      <nav aria-label="Student resources" style={{ display: "grid", gap: 12 }}>
        <Link style={linkStyle} href="/docs/student-api-guide">Student API guide</Link>
        <Link style={linkStyle} href="/docs/student-investigation">Guided investigation worksheet</Link>
        <a style={linkStyle} href="/postman/API_Investigation_Lab.postman_collection.json">Postman collection</a>
        <a style={linkStyle} href="/postman/Lab.postman_environment.json">Postman environment template</a>
      </nav>
      <p style={{ color: "#526879", marginTop: 36 }}>All people, services, and records are fictional.</p>
    </main>
  );
}
