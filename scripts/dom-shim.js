const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
const FRAGMENT_NODE = 11;

class Node {
  constructor() {
    this.childNodes = [];
    this.parentNode = null;
  }
  get firstChild() {
    return this.childNodes[0] || null;
  }
  get nextSibling() {
    const p = this.parentNode;
    if (!p) return null;
    return p.childNodes[p.childNodes.indexOf(this) + 1] || null;
  }
  insertBefore(node, ref) {
    if (node instanceof DocumentFragment) {
      for (const child of node.childNodes.slice()) this.insertBefore(child, ref);
      node.childNodes.length = 0;
      return node;
    }
    if (node.parentNode) node.parentNode.removeChild(node);
    const index = ref ? this.childNodes.indexOf(ref) : -1;
    if (index === -1) this.childNodes.push(node);
    else this.childNodes.splice(index, 0, node);
    node.parentNode = this;
    return node;
  }
  appendChild(node) {
    return this.insertBefore(node, null);
  }
  removeChild(node) {
    const index = this.childNodes.indexOf(node);
    if (index !== -1) this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }
  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }
  get textContent() {
    let out = "";
    for (const child of this.childNodes) {
      if (child.nodeType === COMMENT_NODE) continue;
      out += child.textContent;
    }
    return out;
  }
  set textContent(value) {
    for (const child of this.childNodes.slice()) child.parentNode = null;
    this.childNodes.length = 0;
    if (value) this.appendChild(new Text(value));
  }
}

class CharacterData extends Node {
  constructor(data) {
    super();
    this.nodeValue = String(data);
  }
  get textContent() {
    return this.nodeValue;
  }
  set textContent(value) {
    this.nodeValue = String(value);
  }
}

class Text extends CharacterData {
  nodeType = TEXT_NODE;
}
class Comment extends CharacterData {
  nodeType = COMMENT_NODE;
}
class DocumentFragment extends Node {
  nodeType = FRAGMENT_NODE;
}

class Element extends Node {
  constructor(tag) {
    super();
    this.nodeType = ELEMENT_NODE;
    this.tagName = tag.toUpperCase();
    this.attributes = {};
    this.style = {};
    this._listeners = {};
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
  addEventListener(type, handler) {
    (this._listeners[type] ??= []).push(handler);
  }
  // Test helper: fire an event by name.
  fire(type, event = {}) {
    for (const handler of this._listeners[type] || []) {
      handler({ preventDefault() {}, stopPropagation() {}, ...event });
    }
  }
  get className() {
    return this.attributes.class || "";
  }
}

export function installDOM() {
  globalThis.document = {
    createElement: (tag) => new Element(tag),
    createTextNode: (data) => new Text(data),
    createComment: (data) => new Comment(data),
    createDocumentFragment: () => new DocumentFragment(),
  };
  globalThis.Node = Node;
}
