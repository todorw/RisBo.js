// RisBo.js — Server-side rendering
// -----------------------------------------------------------------------------
// `renderToString` renders the exact same components to an HTML string, with no
// browser required. It installs a tiny in-memory DOM, builds the tree with the
// normal renderer (running each reactive binding once), serializes it, then
// tears everything down. Event handlers are dropped; reactive values render at
// their current value.
// -----------------------------------------------------------------------------

import { createRoot } from "./reactivity.js";
import { createComponent, insert } from "./dom.js";

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);
const BOOLEAN = new Set(["checked", "selected", "disabled", "readonly", "multiple", "required", "autofocus"]);

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
const FRAGMENT_NODE = 11;

class SNode {
  constructor() {
    this.childNodes = [];
    this.parentNode = null;
  }
  get nextSibling() {
    const p = this.parentNode;
    if (!p) return null;
    return p.childNodes[p.childNodes.indexOf(this) + 1] || null;
  }
  insertBefore(node, ref) {
    if (node.nodeType === FRAGMENT_NODE) {
      for (const child of node.childNodes.slice()) this.insertBefore(child, ref);
      node.childNodes.length = 0;
      return node;
    }
    if (node.parentNode) node.parentNode.removeChild(node);
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i === -1) this.childNodes.push(node);
    else this.childNodes.splice(i, 0, node);
    node.parentNode = this;
    return node;
  }
  appendChild(node) {
    return this.insertBefore(node, null);
  }
  removeChild(node) {
    const i = this.childNodes.indexOf(node);
    if (i !== -1) this.childNodes.splice(i, 1);
    node.parentNode = null;
    return node;
  }
  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }
  set textContent(value) {
    this.childNodes.length = 0;
    if (value) this.appendChild(new SText(value));
  }
  get textContent() {
    let out = "";
    for (const c of this.childNodes) if (c.nodeType !== COMMENT_NODE) out += c.textContent;
    return out;
  }
}

class SText extends SNode {
  constructor(data) {
    super();
    this.nodeType = TEXT_NODE;
    this.data = String(data);
  }
  get textContent() {
    return this.data;
  }
  set textContent(v) {
    this.data = String(v);
  }
}

class SComment extends SNode {
  constructor(data) {
    super();
    this.nodeType = COMMENT_NODE;
    this.data = String(data);
  }
}

class SFragment extends SNode {
  constructor() {
    super();
    this.nodeType = FRAGMENT_NODE;
  }
}

class SElement extends SNode {
  constructor(tag) {
    super();
    this.nodeType = ELEMENT_NODE;
    this.tagName = tag.toLowerCase();
    this.attributes = {};
    this.style = {};
    this.props = {};
  }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
  }
  getAttribute(key) {
    return key in this.attributes ? this.attributes[key] : null;
  }
  removeAttribute(key) {
    delete this.attributes[key];
  }
  addEventListener() {}
  // Reflected DOM properties (set by the renderer for form controls etc.)
  set value(v) { this.props.value = v; }
  get value() { return this.props.value; }
  set checked(v) { this.props.checked = v; }
  get checked() { return this.props.checked; }
  set selected(v) { this.props.selected = v; }
  set disabled(v) { this.props.disabled = v; }
  set innerHTML(v) { this._html = String(v); }
  get innerHTML() { return this._html || ""; }
}

function makeDocument() {
  const doc = {
    createElement: (tag) => new SElement(tag),
    createTextNode: (data) => new SText(data),
    createComment: (data) => new SComment(data),
    createDocumentFragment: () => new SFragment(),
  };
  doc.body = new SElement("body");
  return doc;
}

const escapeText = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");

function styleString(style) {
  if (style.cssText) return style.cssText;
  const parts = [];
  for (const key in style) {
    if (key === "cssText") continue;
    const prop = key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
    parts.push(`${prop}: ${style[key]}`);
  }
  return parts.join("; ");
}

function serialize(node) {
  switch (node.nodeType) {
    case TEXT_NODE:
      return escapeText(node.data);
    case COMMENT_NODE:
      // Internal markers (reactive regions, For/Index, portals) are dropped so
      // the serialized HTML stays clean.
      return "";
    case FRAGMENT_NODE:
      return node.childNodes.map(serialize).join("");
    case ELEMENT_NODE: {
      const attrs = [];
      for (const key in node.attributes) attrs.push(`${key}="${escapeAttr(node.attributes[key])}"`);

      const style = styleString(node.style);
      if (style && !("style" in node.attributes)) attrs.push(`style="${escapeAttr(style)}"`);

      if (node.props.value != null) attrs.push(`value="${escapeAttr(node.props.value)}"`);
      for (const name of BOOLEAN) if (node.props[name]) attrs.push(name);

      const open = `<${node.tagName}${attrs.length ? " " + attrs.join(" ") : ""}>`;
      if (VOID.has(node.tagName)) return open;

      const inner =
        node._html != null ? node._html : node.childNodes.map(serialize).join("");
      return `${open}${inner}</${node.tagName}>`;
    }
    default:
      return "";
  }
}

/**
 * Render a component (or node) to an HTML string.
 * @param {Function|object} component
 * @returns {string}
 */
export function renderToString(component) {
  const previous = globalThis.document;
  globalThis.document = makeDocument();
  try {
    let html = "";
    createRoot((dispose) => {
      const node =
        typeof component === "function" ? createComponent(component, {}) : component;
      const container = globalThis.document.createElement("div");
      insert(container, node, null);
      html = container.childNodes.map(serialize).join("");
      dispose();
    });
    return html;
  } finally {
    globalThis.document = previous;
  }
}
