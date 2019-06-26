/* @flow */
import { createElement } from 'react'
import { withThemeFactory } from '@stardust-ui/fela-bindings'

import FelaTheme from './FelaTheme'

export default withThemeFactory(createElement, FelaTheme)
