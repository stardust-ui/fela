/* @flow */
import cssifyDeclaration from 'css-in-js-utils/lib/cssifyDeclaration'
import arrayEach from 'fast-loops/lib/arrayEach'
import objectEach from 'fast-loops/lib/objectEach'
import objectFilter from 'fast-loops/lib/objectFilter'
import isPlainObject from 'isobject'

import {
  generateDeclarationReference,
  generateCombinedMediaQuery,
  generateCSSSelector,
  isMediaQuery,
  isNestedSelector,
  isUndefinedValue,
  isSupport,
  normalizeNestedProperty,
  processStyleWithPlugins,
  STATIC_TYPE,
  RULE_TYPE,
  KEYFRAME_TYPE,
  FONT_TYPE,
  CLEAR_TYPE,
} from 'fela-utils'

import cssifyFontFace from './cssifyFontFace'
import cssifyKeyframe from './cssifyKeyframe'
import cssifyStaticStyle from './cssifyStaticStyle'
import generateAnimationName from './generateAnimationName'
import generateClassName from './generateClassName'
import generateFontSource from './generateFontSource'
import generateStaticReference from './generateStaticReference'
import getDocumentRefIndex from './getDocumentRefIndex'
import getFontLocals from './getFontLocals'
import isSafeClassName from './isSafeClassName'
import toCSSString from './toCSSString'
import validateSelectorPrefix from './validateSelectorPrefix'

import type {
  DOMRenderer,
  DOMRendererConfig,
} from '../../../flowtypes/DOMRenderer'
import type { FontProperties } from '../../../flowtypes/FontProperties'

export default function createRenderer(
  config: DOMRendererConfig = {}
): DOMRenderer {
  // use default value with document
  const defaultDocumentRef = {
    target: typeof document === 'undefined' ? null : document,
    refCount: 1,
    refId: 0,
  }

  let renderer: DOMRenderer = {
    listeners: [],
    keyframePrefixes: config.keyframePrefixes || ['-webkit-', '-moz-'],
    plugins: config.plugins || [],
    mediaQueryOrder: config.mediaQueryOrder || [],
    supportQueryOrder: config.supportQueryOrder || [],
    ruleOrder: [
      /^:link/,
      /^:visited/,
      /^:hover/,
      /^:focus-within/,
      /^:focus/,
      /^:active/,
    ],
    selectorPrefix: validateSelectorPrefix(config.selectorPrefix),
    filterClassName: config.filterClassName || isSafeClassName,
    devMode: config.devMode || false,

    uniqueRuleIdentifier: 0,
    uniqueKeyframeIdentifier: 0,

    documentRefs: [defaultDocumentRef],
    nodes: {},
    scoreIndex: {},
    // use a flat cache object with pure string references
    // to achieve maximal lookup performance and memoization speed
    cache: {},

    getNextRuleIdentifier() {
      return ++renderer.uniqueRuleIdentifier
    },

    renderRule(rule: Function, props: Object = {}): string {
      return renderer._renderStyle(rule(props, renderer), props)
    },

    renderKeyframe(keyframe: Function, props: Object = {}): string {
      const resolvedKeyframe = keyframe(props, renderer)
      const processedKeyframe = processStyleWithPlugins(
        renderer,
        resolvedKeyframe,
        KEYFRAME_TYPE,
        props
      )

      const keyframeReference = JSON.stringify(processedKeyframe)

      if (!renderer.cache.hasOwnProperty(keyframeReference)) {
        // use another unique identifier to ensure minimal css markup
        const animationName = generateAnimationName(
          ++renderer.uniqueKeyframeIdentifier
        )

        const cssKeyframe = cssifyKeyframe(
          processedKeyframe,
          animationName,
          renderer.keyframePrefixes
        )

        const change = {
          type: KEYFRAME_TYPE,
          keyframe: cssKeyframe,
          name: animationName,
        }

        renderer.cache[keyframeReference] = change
        renderer._emitChange(change)
      }

      return renderer.cache[keyframeReference].name
    },

    renderFont(
      family: string,
      files: Array<string>,
      properties: FontProperties = {}
    ): string {
      const { localAlias, ...otherProperties } = properties

      const fontReference = family + JSON.stringify(properties)
      const fontLocals = getFontLocals(localAlias)

      if (!renderer.cache.hasOwnProperty(fontReference)) {
        const fontFamily = toCSSString(family)

        const fontFace = {
          ...otherProperties,
          src: generateFontSource(files, fontLocals),
          fontFamily,
        }

        const cssFontFace = cssifyFontFace(fontFace)

        const change = {
          type: FONT_TYPE,
          fontFace: cssFontFace,
          fontFamily,
        }

        renderer.cache[fontReference] = change
        renderer._emitChange(change)
      }

      return renderer.cache[fontReference].fontFamily
    },

    renderStatic(staticStyle: Object | string, selector?: string): void {
      const staticReference = generateStaticReference(staticStyle, selector)

      if (!renderer.cache.hasOwnProperty(staticReference)) {
        const cssDeclarations = cssifyStaticStyle(staticStyle, renderer)

        const change = {
          type: STATIC_TYPE,
          css: cssDeclarations,
          selector,
        }

        renderer.cache[staticReference] = change
        renderer._emitChange(change)
      }
    },

    subscribe(callback: Function): { unsubscribe: Function } {
      renderer.listeners.push(callback)

      return {
        unsubscribe: () =>
          renderer.listeners.splice(renderer.listeners.indexOf(callback), 1),
      }
    },

    subscribeDocument(target: Document) {
      const refIndex = getDocumentRefIndex(renderer.documentRefs, target)

      if (refIndex === null) {
        renderer.documentRefs.push({
          target,
          refCount: 1,
          refId: renderer.getNextRuleIdentifier(),
        })

        // simulate rendering to ensure all styles rendered prior to
        // calling FelaDOM.render are correctly injected as well
        objectEach(renderer.cache, renderer._emitChange)
      } else {
        renderer.documentRefs[refIndex].refCount += 1
      }

      return {
        unsubscribe: () => {
          const index = getDocumentRefIndex(renderer.documentRefs, target)
          const ref = renderer.documentRefs[index]

          if (ref) {
            if (ref.refCount === 1) {
              renderer.nodes = objectFilter(
                renderer.nodes,
                node => node.refId !== ref.refId
              )
              renderer.documentRefs.splice(index, 1)
            } else {
              ref.refCount -= 1
            }
          }
        },
      }
    },

    clear() {
      renderer.uniqueRuleIdentifier = 0
      renderer.uniqueKeyframeIdentifier = 0
      renderer.documentRefs = [defaultDocumentRef]
      renderer.cache = {}

      renderer._emitChange({
        type: CLEAR_TYPE,
      })
    },

    _renderStyle(style: Object = {}, props: Object = {}): string {
      const processedStyle = processStyleWithPlugins(
        renderer,
        style,
        RULE_TYPE,
        props
      )

      return renderer._renderStyleToClassNames(processedStyle).slice(1)
    },
    _renderStyleToClassNames(
      { _className, ...style }: Object,
      pseudo: string = '',
      media: string = '',
      support: string = ''
    ): string {
      let classNames = _className ? ` ${_className}` : ''

      for (const property in style) {
        const value = style[property]

        if (isPlainObject(value)) {
          if (isNestedSelector(property)) {
            classNames += renderer._renderStyleToClassNames(
              value,
              pseudo + normalizeNestedProperty(property),
              media,
              support
            )
          } else if (isMediaQuery(property)) {
            const combinedMediaQuery = generateCombinedMediaQuery(
              media,
              property.slice(6).trim()
            )
            classNames += renderer._renderStyleToClassNames(
              value,
              pseudo,
              combinedMediaQuery,
              support
            )
          } else if (isSupport(property)) {
            const combinedSupport = generateCombinedMediaQuery(
              support,
              property.slice(9).trim()
            )
            classNames += renderer._renderStyleToClassNames(
              value,
              pseudo,
              media,
              combinedSupport
            )
          } else {
            console.warn(`The object key "${property}" is not a valid nested key in Fela. 
Maybe you forgot to add a plugin to resolve it? 
Check http://fela.js.org/docs/basics/Rules.html#styleobject for more information.`)
          }
        } else {
          const declarationReference = generateDeclarationReference(
            property,
            value,
            pseudo,
            media,
            support
          )

          if (!renderer.cache.hasOwnProperty(declarationReference)) {
            // we remove undefined values to enable
            // usage of optional props without side-effects
            if (isUndefinedValue(value)) {
              renderer.cache[declarationReference] = {
                className: '',
              }
              /* eslint-disable no-continue */
              continue
              /* eslint-enable */
            }

            const className =
              renderer.selectorPrefix +
              generateClassName(
                renderer.getNextRuleIdentifier,
                renderer.filterClassName
              )

            const declaration = cssifyDeclaration(property, value)
            const selector = generateCSSSelector(className, pseudo)

            const change = {
              type: RULE_TYPE,
              className,
              selector,
              declaration,
              pseudo,
              media,
              support,
            }

            renderer.cache[declarationReference] = change
            renderer._emitChange(change)
          }

          const cachedClassName = renderer.cache[declarationReference].className

          // only append if we got a class cached
          if (cachedClassName) {
            classNames += ` ${cachedClassName}`
          }
        }
      }

      return classNames
    },

    _emitChange(change: Object): void {
      arrayEach(renderer.listeners, listener => listener(change))
    },
  }

  // initial setup
  renderer.keyframePrefixes.push('')

  if (config.enhancers) {
    arrayEach(config.enhancers, enhancer => {
      renderer = enhancer(renderer)
    })
  }

  return renderer
}
