declare module "@stardust-ui/fela" {
  import * as CSS from 'csstype';
  import { TRuleType, TKeyframeType, TFontType, TStaticType, TClearType } from 'fela-utils';

  export type TRuleProps = {};
  export type TRule<T = TRuleProps> = (props: T, renderer: IRenderer) => IStyle
  export type TKeyFrame<T = TRuleProps> = (props: T, renderer: IRenderer) => {
    from?: IStyle,
    to?: IStyle,

    [persent: string]: IStyle | undefined;
  };

  type TRendererCreator = (config?: IConfig) => IRenderer;
  type TPlugin = (style: IStyle) => IStyle; //http://fela.js.org/docs/advanced/Plugins.html
  type TEnhancer = (renderer: IRenderer) => IRenderer; //http://fela.js.org/docs/advanced/Enhancers.html

  type TSubscribeMessageType = TRuleType | TKeyframeType | TFontType | TStaticType | TClearType

  interface ISubscribeMessage {
    type: TSubscribeMessageType;
  }
  interface ISubscribeRuleOrStaticObjectMessage extends ISubscribeMessage { static?: boolean; declaration: string; selector: string; media: string; }
  interface ISubscribeKeyframesMessage extends ISubscribeMessage { name: string; keyframe: string; }
  interface ISubscribeFontFaceMessage extends ISubscribeMessage { fontFamily: string; fontFace: string; }
  interface ISubscribeStaticStringMessage extends ISubscribeMessage { css: string; }
  interface ISubscribeClearMessage extends ISubscribeMessage { }

  interface IRenderer {
    renderRule<T = TRuleProps>(rule: TRule<T>, props: T): string
    renderKeyframe<T = TRuleProps>(keyFrame: TKeyFrame<T>, props: T): string;
    renderFont<T = TRuleProps>(family: string, files: Array<string>, props: T): void;
    renderStatic(style: string, selector?: string): void;
    renderStatic(style: IStyle, selector: string): void;
    renderToString(): string;
    subscribe(event: (msg: ISubscribeRuleOrStaticObjectMessage | ISubscribeKeyframesMessage | ISubscribeFontFaceMessage | ISubscribeStaticStringMessage | ISubscribeClearMessage) => void): { unsubscribe: () => void; }
    clear(): void;
  }

  //http://fela.js.org/docs/advanced/RendererConfiguration.html
  interface IConfig {
    plugins?: Array<TPlugin>;
    keyframePrefixes?: Array<string>;
    enhancers?: Array<TEnhancer>;
    mediaQueryOrder?: Array<string>;
    selectorPrefix?: string;
    filterClassName?: (className: string) => boolean;
    devMode?: boolean;
  }

  export interface IStyle extends CSS.Properties<string | number> {
    // for selectors and pseudo classes use fela-plugin-typescript
  }

  function createRenderer(config?: IConfig): IRenderer;

  function combineRules<A, B>(a: TRule<A>, b: TRule<B>): TRule<A & B>
  function combineRules<A, B, C>(
    a: TRule<A>,
    b: TRule<B>,
    c: TRule<C>,
  ): TRule<A & B & C>
  function combineRules(...rules: Array<TRule>): TRule

  function enhance(...enhancers: Array<TEnhancer>): (rendererCreator: TRendererCreator) => TRendererCreator;
}

declare module "@stardust-ui/fela-dom" {
  import { IRenderer } from 'fela';

  function render(renderer: IRenderer): void;
  function rehydrate(renderer: IRenderer): void;
  function renderToMarkup(renderer: IRenderer): string;
  function renderToSheetList(renderer: IRenderer): {
    css: string,
    type: 'RULE' | 'KEYFRAME' | 'FONT' | 'STATIC',
    media?: string,
    support?: boolean,
  }[];
}
