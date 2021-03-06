/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const React = require('react')
const Immutable = require('immutable')
const ImmutableComponent = require('../../../js/components/immutableComponent')
const windowActions = require('../../../js/actions/windowActions')
const separatorMenuItem = require('../../common/commonMenu').separatorMenuItem
const keyCodes = require('../../../js/constants/keyCodes')
const { wrappingClamp } = require('../../common/lib/formatUtil')

const showContextMenu = (rect, submenu, lastFocusedSelector) => {
  windowActions.setContextMenuDetail(Immutable.fromJS({
    left: rect.left,
    top: rect.bottom,
    template: submenu.map((submenuItem) => {
      if (submenuItem.type === separatorMenuItem.type) {
        return submenuItem
      }
      submenuItem.click = function (e) {
        e.preventDefault()
        if (lastFocusedSelector) {
          // Send focus back to the active web frame
          const results = document.querySelectorAll(lastFocusedSelector)
          if (results.length === 1) {
            results[0].focus()
          }
        }
        windowActions.clickMenubarSubmenu(submenuItem.label)
      }
      return submenuItem
    })
  }))
}

class MenubarItem extends ImmutableComponent {
  constructor () {
    super()
    this.onClick = this.onClick.bind(this)
    this.onMouseOver = this.onMouseOver.bind(this)
  }
  onClick (e) {
    if (e && e.stopPropagation) {
      e.stopPropagation()
    }
    // If clicking on an already selected item, deselect it
    const selected = this.props.menubar.props.selectedLabel
    if (selected && selected === this.props.label) {
      windowActions.setContextMenuDetail()
      windowActions.setMenubarSelectedLabel()
      return
    }
    // Otherwise, mark item as selected and show its context menu
    windowActions.setMenubarSelectedLabel(this.props.label)
    const rect = e.target.getBoundingClientRect()
    showContextMenu(rect, this.props.submenu, this.props.lastFocusedSelector)
  }
  onMouseOver (e) {
    const selected = this.props.menubar.props.selectedLabel
    if (selected && selected !== this.props.label) {
      this.onClick(e)
    }
  }
  render () {
    return <span
      className={'menubarItem' + (this.props.selected ? ' selected' : '')}
      onClick={this.onClick}
      onMouseOver={this.onMouseOver}
      data-label={this.props.label}>
      { this.props.label }
    </span>
  }
}

/**
 * Menubar that can be optionally be displayed at the top of a window (in favor of the system menu).
 * First intended use is with Windows to enable a slim titlebar.
 * NOTE: the system menu is still created and used in order to keep the accelerators working.
 */
class Menubar extends ImmutableComponent {
  constructor () {
    super()
    this.onKeyDown = this.onKeyDown.bind(this)
  }
  componentWillMount () {
    document.addEventListener('keydown', this.onKeyDown)
  }
  componentWillUnmount () {
    document.removeEventListener('keydown', this.onKeyDown)
  }
  getTemplateByLabel (label) {
    const element = this.props.template.find((element) => {
      return element.get('label') === label
    })
    return element ? element.get('submenu') : null
  }
  get selectedTemplate () {
    return this.getTemplateByLabel(this.props.selectedLabel)
  }
  get selectedTemplateItemsOnly () {
    // exclude the separators AND items that are not visible
    return this.selectedTemplate.filter((element) => {
      if (element.get('type') === separatorMenuItem.type) return false
      if (element.has('visible')) return element.get('visible')
      return true
    })
  }
  get selectedIndexMax () {
    const result = this.selectedTemplateItemsOnly
    if (result && result.size && result.size > 0) {
      return result.size
    }
    return 0
  }
  getRectByLabel (label) {
    const selected = document.querySelectorAll('.menubar .menubarItem[data-label=\'' + label + '\']')
    if (selected.length === 1) {
      return selected.item(0).getBoundingClientRect()
    }
    return null
  }
  get selectedRect () {
    return this.getRectByLabel(this.props.selectedLabel)
  }
  onKeyDown (e) {
    switch (e.which) {
      case keyCodes.ENTER:
        e.preventDefault()
        if (this.selectedTemplate) {
          const selectedLabel = this.selectedTemplateItemsOnly.getIn([this.props.selectedIndex, 'label'])
          windowActions.clickMenubarSubmenu(selectedLabel)
          windowActions.resetMenuState()
        }
        break

      case keyCodes.LEFT:
      case keyCodes.RIGHT:
        if (!this.props.autohide && !this.props.selectedLabel) break

        e.preventDefault()
        if (this.props.template.size > 0) {
          const selectedIndex = this.props.template.findIndex((element) => {
            return element.get('label') === this.props.selectedLabel
          })
          const nextIndex = selectedIndex === -1
            ? 0
            : wrappingClamp(
              selectedIndex + (e.which === keyCodes.LEFT ? -1 : 1),
              0,
              this.props.template.size - 1)

          // BSCTODO: consider submenus (ex: for bookmark folders)

          const nextLabel = this.props.template.getIn([nextIndex, 'label'])
          const nextRect = this.getRectByLabel(nextLabel)

          windowActions.setMenubarSelectedLabel(nextLabel)

          // Context menu already being displayed; auto-open the next one
          if (this.props.contextMenuDetail && this.selectedTemplate && nextRect) {
            windowActions.setSubmenuSelectedIndex(0)
            showContextMenu(nextRect, this.getTemplateByLabel(nextLabel).toJS(), this.props.lastFocusedSelector)
          }
        }
        break

      case keyCodes.UP:
      case keyCodes.DOWN:
        if (!this.props.autohide && !this.props.selectedLabel) break

        e.preventDefault()
        if (this.props.selectedLabel && this.selectedTemplate) {
          if (!this.props.contextMenuDetail && this.selectedRect) {
            // First time hitting up/down; popup the context menu
            windowActions.setSubmenuSelectedIndex(0)
            showContextMenu(this.selectedRect, this.selectedTemplate.toJS(), this.props.lastFocusedSelector)
          } else {
            // Context menu already visible; move selection up or down
            const nextIndex = wrappingClamp(
              this.props.selectedIndex + (e.which === keyCodes.UP ? -1 : 1),
              0,
              this.selectedIndexMax - 1)
            windowActions.setSubmenuSelectedIndex(nextIndex)
          }
        }
        break
    }
  }
  shouldComponentUpdate (nextProps, nextState) {
    return this.props.selectedLabel !== nextProps.selectedLabel
  }
  render () {
    return <div className='menubar'>
      {
        this.props.template.map((menubarItem) => {
          let props = {
            label: menubarItem.get('label'),
            submenu: menubarItem.get('submenu').toJS(),
            menubar: this,
            lastFocusedSelector: this.props.lastFocusedSelector
          }
          if (props.label === this.props.selectedLabel) {
            props.selected = true
          }
          return <MenubarItem {...props} />
        })
      }
    </div>
  }
}

module.exports = Menubar
