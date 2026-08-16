// Internal workspace sites can read the authenticated OpenAI user from the
// forwarded request headers:
//
// import { headers } from "next/headers";
//
// export default async function Home() {
//   const requestHeaders = await headers();
//   const email = requestHeaders.get("oai-authenticated-user-email");
//   const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
//   const fullName =
//     encodedFullName &&
//     requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
//       "percent-encoded-utf-8"
//       ? decodeURIComponent(encodedFullName)
//       : null;
//   const displayName = fullName ?? email;
//   // ...
// }

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ mobile?: string }>;
}) {
  const { mobile } = await searchParams;
  return (
    <main className={`site-frame-shell${mobile === "1" ? " mobile-review" : ""}`}>
      <iframe
        className="site-frame"
        src="/finish-match-v4.html"
        title="Colour Match v5 automatic interior photo finisher"
      />
    </main>
  );
}
