import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "../src/server.js";
import { h, Show, For } from "../src/dom.js";
import { signal } from "../src/reactivity.js";

test("renders a static tree to HTML", () => {
  const html = renderToString(() =>
    h("section", { class: "card" }, h("h1", null, "Hello"), h("p", null, "World"))
  );
  assert.equal(html, '<section class="card"><h1>Hello</h1><p>World</p></section>');
});

test("escapes text and attribute content", () => {
  const html = renderToString(() =>
    h("div", { title: 'a "b" & c' }, "<script>alert(1)</scr" + "ipt>")
  );
  assert.equal(
    html,
    '<div title="a &quot;b&quot; &amp; c">&lt;script&gt;alert(1)&lt;/script&gt;</div>'
  );
});

test("renders reactive values at their current value", () => {
  const count = signal(7);
  const html = renderToString(() => h("span", null, () => `n=${count()}`));
  assert.equal(html, "<span>n=7</span>");
});

test("self-closes void elements and reflects value", () => {
  const html = renderToString(() => h("input", { type: "text", value: () => "hi" }));
  assert.equal(html, '<input type="text" value="hi">');
});

test("renders svg elements, preserving camelCase tag names", () => {
  const html = renderToString(() =>
    h(
      "svg",
      { viewBox: "0 0 10 10" },
      h("defs", null, h("linearGradient", { id: "g" })),
      h("path", { d: "M0 0" })
    )
  );
  assert.equal(html, '<svg viewBox="0 0 10 10"><defs><linearGradient id="g"></linearGradient></defs><path d="M0 0"></path></svg>');
});

test("renders control flow (Show + For)", () => {
  const html = renderToString(() =>
    h(
      "ul",
      null,
      h(
        Show,
        { when: () => true },
        () =>
          h(
            For,
            { each: () => [1, 2], by: (n) => n },
            (n) => h("li", null, String(n))
          )
      )
    )
  );
  // comment markers from Show/For are emitted but harmless
  assert.match(html, /<li>1<\/li>/);
  assert.match(html, /<li>2<\/li>/);
  assert.ok(html.startsWith("<ul>"));
  assert.ok(html.endsWith("</ul>"));
});
