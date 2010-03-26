
// Haml - Copyright TJ Holowaychuk <tj@vision-media.ca> (MIT Licensed)

/**
 * Version.
 */

exports.version = '0.0.1'

/**
 * Default error context length.
 */

exports.errorContextLength = 15

/**
 * Default supported doctypes.
 */

exports.doctypes = {
  '5': '<!DOCTYPE html>',
  'xml': '<?xml version="1.0" encoding="utf-8" ?>',
  'default': '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">',
  'strict': '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">',
  'frameset': '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Frameset//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-frameset.dtd">',
  '1.1': '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">',
  'basic': '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML Basic 1.1//EN" "http://www.w3.org/TR/xhtml-basic/xhtml-basic11.dtd">',
  'mobile': '<!DOCTYPE html PUBLIC "-//WAPFORUM//DTD XHTML Mobile 1.2//EN" "http://www.openmobilealliance.org/tech/DTD/xhtml-mobile12.dtd">'
}

/**
 * Lexing rules.
 */

var rules = {
  doctype: /^!!! *([^\n]*)/,
  indent: /^\n( +)/,
  newline: /^\n/,
  literal: /^\\(.)/,
  plugin: /^:(\w+)( *[^\n]*)/,
  code: /^\-([^\n]+)/,
  outputCode: /^=([^\n]+)/,
  escapeCode: /^&=([^\n]+)/,
  attrs: /^\{(.*?)\}/,
  tag: /^%([a-zA-Z][a-zA-Z0-9]*)/,
  class: /^\.([a-zA-Z0-9\-]+)/,
  id: /^\#([a-zA-Z0-9\-]+)/,
  text: /^([^\n]+)/
}

/**
 * Return error context _str_.
 *
 * @param  {string} str
 * @return {string}
 * @api private
 */

function context(str) {
  return String(str)
    .substr(0, exports.errorContextLength)
    .replace(/\n/g, '\\n')
}

/**
 * Tokenize _str_.
 *
 * @param  {string} str
 * @return {array}
 * @api private
 */

function tokenize(str) {
  var captures,
      token,
      tokens = [],
      lastIndents = 0
  while (str.length) {
    for (var type in rules)
      if (captures = rules[type].exec(str)) {
        token = {
          type: type,
          val: captures.length > 2
            ? captures.slice(1)
            : captures[1]
        }
        str = str.substr(captures[0].length)
        if (type !== 'indent') break
        var indents = token.val.length / 2
        if (indents % 1)
          throw new Error('invalid indentation; got ' + token.val.length + ' spaces, should be multiple of 2')
        else if (indents - 1 > lastIndents)
          throw new Error('invalid indentation; got ' + indents + ', when previous was ' + lastIndents)
        else if (lastIndents > indents)
          while (lastIndents-- > indents)
            tokens.push({ type: 'dedent' })
        else if (lastIndents !== indents)
          tokens.push({ type: 'indent' })
        lastIndents = indents
      }
    if (token) {
      if (token.type !== 'newline')
        tokens.push(token)
      token = null
    } else 
      throw new Error('near "' + context(str) + '"')
  }
  return tokens.concat({ type: 'eof' })
}

// --- Parser

/**
 * Initialize parser with _str_ and _options_.
 */

function Parser(str, options) {
  this.tokens = tokenize(str)
}

Parser.prototype = {
  
  /**
   * Format _attrs_.
   *
   * @param  {object} attrs
   * @return {string}
   * @api private
   */
  
  attrs: function(attrs) {
    if (!attrs) return ''
    return ' " + attrs({' + attrs + '}) + "'  
  },
  
  /**
   * Lookahead a single token.
   *
   * @return {object}
   * @api private
   */
  
  get peek() {
    return this.tokens[0]
  },
  
  /**
   * Advance a single token.
   *
   * @return {object}
   * @api private
   */
  
  get advance() {
    return this.tokens.shift()
  },
  
  /**
   *    dedent
   *  | eof
   */
  
  get dedent() {
    switch (this.peek.type) {
      case 'eof':
        return
      case 'dedent':
        return this.advance
      default:
        throw new Error('expected dedent, got ' + this.peek.type)
    }
  },
  
  /**
   * text
   */
  
  get text() {
    return '"' + this.advance.val.trim() + '"'
  },
  
  /**
   * indent expr dedent
   */
  
  get block() {
    var buf = []
    this.advance
    while (this.peek.type !== 'dedent' &&
           this.peek.type !== 'eof')
      buf.push(this.expr)
    this.dedent
    return buf.join(' + ')
  },
  
  /**
   *   tag
   * | tag text
   * | tag outputCode
   * | tag escapeCode
   * | tag block
   */
  
  get tag() {
    var tag = this.advance.val,
        attrs = this.peek.type === 'attrs' ? this.advance.val : null,
        buf = ['"\\n<' + tag + this.attrs(attrs) + '>"']
    switch (this.peek.type) {
      case 'text':
        buf.push(this.text)
        break
      case 'outputCode':
        buf.push(this.outputCode)
        break
      case 'escapeCode':
        buf.push(this.escapeCode)
        break
      case 'indent':
        buf.push(this.block)
    }
    buf.push('"</' + tag + '>\\n"')
    return buf.join(' + ')
  },
  
  /**
   * outputCode
   */
  
  get outputCode() {
    return '(' + this.advance.val + ')'
  },
  
  /**
   * escapeCode
   */
  
  get escapeCode() {
    return '("' + escape(this.advance.val) + '")'
  },
  
  /**
   * doctype
   */
  
  get doctype() {
    var doctype = this.advance.val.trim().toLowerCase() || 'default'
    if (doctype in exports.doctypes)
      return '"' + exports.doctypes[doctype].replace(/"/g, '\\"') + '"'
    else
      throw new Error("doctype `" + doctype + "' does not exist")
  },
  
  /**
   *   code
   * | code block 
   */
  
  get code() {
    var code = this.advance.val
    if (this.peek.type === 'indent')
      return '(function(){ var buf = []; ' + code + ' buf.push(' + this.block + '); return buf.join("") }).call(this)'
    return '(function(){ ' + code + '; return "" }).call(this)'
  },
  
  /**
   *   eof
   * | tag
   * | code
   * | doctype
   * | escapeCode
   * | outputCode
   */
  
  get expr() {
    switch (this.peek.type) {
      case 'tag': return this.tag
      case 'code': return this.code
      case 'doctype': return this.doctype
      case 'escapeCode': return this.escapeCode
      case 'outputCode': return this.outputCode
      default:
        throw new Error('unexpected ' + this.peek.type)
    }
  },
  
  /**
   * expr*
   */
  
  get js() {
    var buf = []
    while (this.peek.type !== 'eof')
      buf.push(this.expr)
    return buf.join(' + ')
  }
}

/**
 * Escape html entities in _str_.
 *
 * @param  {string} str
 * @return {string}
 * @api private
 */

function escape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/>/g, '&gt;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
}

/**
 * Render _attrs_ to html escaped attributes.
 *
 * @param  {object} attrs
 * @return {string}
 * @api public
 */

function attrs(attrs) {
  var buf = []
  for (var key in attrs)
    buf.push(key + '="' + escape(attrs[key]) + '"')
  return buf.join(' ')
}

/**
 * Render a _str_ of haml.
 *
 * Options:
 *
 *   - locals   Local variables available to the template
 *   - context  Context in which the template is evaluated (becoming "this")
 *
 * @param  {string} str
 * @param  {object} options
 * @return {string}
 * @api public
 */

exports.render = function(str, options) {
  options = options || {}
  return (function(){
    with (options.locals || {}) {
      return process.compile((new Parser(str, options)).js, options.filename || '__HAML__')
    }
  }).call(options.context)
}