/* @flow */
import { createElement } from 'react'
import { feFactory } from '@stardust-ui/fela-bindings'

import FelaComponent from './FelaComponent'

export default feFactory(createElement, FelaComponent)
