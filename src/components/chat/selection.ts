/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { AppMessagesManager } from "../../lib/appManagers/appMessagesManager";
import type ChatBubbles from "./bubbles";
import type ChatInput from "./input";
import type Chat from "./chat";
import { IS_TOUCH_SUPPORTED } from "../../environment/touchSupport";
import Button from "../button";
import ButtonIcon from "../buttonIcon";
import CheckboxField from "../checkboxField";
import PopupDeleteMessages from "../popups/deleteMessages";
import PopupForward from "../popups/forward";
import { toast } from "../toast";
import SetTransition from "../singleTransition";
import ListenerSetter from "../../helpers/listenerSetter";
import PopupSendNow from "../popups/sendNow";
import appNavigationController, { NavigationItem } from "../appNavigationController";
import { IS_MOBILE_SAFARI } from "../../environment/userAgent";
import I18n, { i18n, _i18n } from "../../lib/langPack";
import findUpClassName from "../../helpers/dom/findUpClassName";
import blurActiveElement from "../../helpers/dom/blurActiveElement";
import cancelEvent from "../../helpers/dom/cancelEvent";
import cancelSelection from "../../helpers/dom/cancelSelection";
import getSelectedText from "../../helpers/dom/getSelectedText";
import rootScope from "../../lib/rootScope";
import { fastRaf } from "../../helpers/schedulers";
import replaceContent from "../../helpers/dom/replaceContent";
import AppSearchSuper from "../appSearchSuper.";
import isInDOM from "../../helpers/dom/isInDOM";
import { randomLong } from "../../helpers/random";
import { attachContextMenuListener } from "../misc";
import { attachClickEvent, AttachClickOptions } from "../../helpers/dom/clickEvent";
import findUpAsChild from "../../helpers/dom/findUpAsChild";
import EventListenerBase from "../../helpers/eventListenerBase";
import safeAssign from "../../helpers/object/safeAssign";

const accumulateMapSet = (map: Map<any, Set<number>>) => {
  return [...map.values()].reduce((acc, v) => acc + v.size, 0);
};

//const MIN_CLICK_MOVE = 32; // minimum bubble height

class AppSelection extends EventListenerBase<{
  toggle: (isSelecting: boolean) => void
}> {
  public selectedMids: Map<PeerId, Set<number>> = new Map();
  public isSelecting = false;

  public selectedText: string;

  protected listenerSetter: ListenerSetter;
  protected appMessagesManager: AppMessagesManager;
  protected isScheduled: boolean;
  protected listenElement: HTMLElement;

  protected onToggleSelection: (forwards: boolean, animate: boolean) => void;
  protected onUpdateContainer: (cantForward: boolean, cantDelete: boolean, cantSend: boolean) => void;
  protected onCancelSelection: () => void;
  protected toggleByMid: (peerId: PeerId, mid: number) => void;
  protected toggleByElement: (bubble: HTMLElement) => void;

  protected navigationType: NavigationItem['type'];

  protected getElementFromTarget: (target: HTMLElement) => HTMLElement;
  protected verifyTarget: (e: MouseEvent, target: HTMLElement) => boolean;
  protected verifyMouseMoveTarget: (e: MouseEvent, element: HTMLElement, selecting: boolean) => boolean;
  protected verifyTouchLongPress: () => boolean;
  protected targetLookupClassName: string;
  protected lookupBetweenParentClassName: string;
  protected lookupBetweenElementsQuery: string;

  protected doNotAnimate: boolean;

  constructor(options: {
    appMessagesManager: AppMessagesManager,
    listenElement: HTMLElement,
    listenerSetter: ListenerSetter,
    getElementFromTarget: AppSelection['getElementFromTarget'],
    verifyTarget?: AppSelection['verifyTarget'],
    verifyMouseMoveTarget?: AppSelection['verifyMouseMoveTarget'],
    verifyTouchLongPress?: AppSelection['verifyTouchLongPress'],
    targetLookupClassName: string,
    lookupBetweenParentClassName: string,
    lookupBetweenElementsQuery: string,
    isScheduled?: AppSelection['isScheduled']
  }) {
    super(false);

    safeAssign(this, options);

    this.navigationType = 'multiselect-' + randomLong() as any;

    if(IS_TOUCH_SUPPORTED) {
      this.listenerSetter.add(this.listenElement)('touchend', () => {
        if(!this.isSelecting) return;
        this.selectedText = getSelectedText();
      });

      attachContextMenuListener(this.listenElement, (e) => {
        if(this.isSelecting || (this.verifyTouchLongPress && !this.verifyTouchLongPress())) return;

        // * these two lines will fix instant text selection on iOS Safari
        document.body.classList.add('no-select'); // * need no-select on body because chat-input transforms in channels
        this.listenElement.addEventListener('touchend', (e) => {
          cancelEvent(e); // ! this one will fix propagation to document loader button, etc
          document.body.classList.remove('no-select');

          //this.chat.bubbles.onBubblesClick(e);
        }, {once: true, capture: true});

        cancelSelection();
        //cancelEvent(e as any);
        const element = this.getElementFromTarget(e.target as HTMLElement);
        if(element) {
          this.toggleByElement(element);
        }
      }, this.listenerSetter);

      return;
    }

    const getElementsBetween = (first: HTMLElement, last: HTMLElement) => { 
      if(first === last) {
        return [];
      }

      const firstRect = first.getBoundingClientRect();
      const lastRect = last.getBoundingClientRect();
      const difference = (firstRect.top - lastRect.top) || (firstRect.left - lastRect.left);
      const isHigher = difference < 0;

      const parent = findUpClassName(first, this.lookupBetweenParentClassName);
      if(!parent) {
        return [];
      }

      const elements = Array.from(parent.querySelectorAll(this.lookupBetweenElementsQuery)) as HTMLElement[];
      let firstIndex = elements.indexOf(first);
      let lastIndex = elements.indexOf(last);

      if(!isHigher) {
        [lastIndex, firstIndex] = [firstIndex, lastIndex];
      }

      const slice = elements.slice(firstIndex + 1, lastIndex);

      // console.log('getElementsBetween', first, last, slice, firstIndex, lastIndex, isHigher);

      return slice;
    };

    this.listenerSetter.add(this.listenElement)('mousedown', (e) => {
      //console.log('selection mousedown', e);
      const element = findUpClassName(e.target, this.targetLookupClassName);
      if(e.button !== 0) {
        return;
      }

      if(this.verifyTarget && !this.verifyTarget(e, element)) {
        return;
      }
      
      const seen: AppSelection['selectedMids'] = new Map();
      let selecting: boolean;

      /* let good = false;
      const {x, y} = e; */

      /* const bubbles = appImManager.bubbles;
      for(const mid in bubbles) {
        const bubble = bubbles[mid];
        bubble.addEventListener('mouseover', () => {
          console.log('mouseover');
        }, {once: true});
      } */

      let firstTarget = element;

      const processElement = (element: HTMLElement, checkBetween = true) => {
        const mid = +element.dataset.mid;
        if(!mid || !element.dataset.peerId) return;
        const peerId = element.dataset.peerId.toPeerId();

        if(!isInDOM(firstTarget)) {
          firstTarget = element;
        }

        let seenSet = seen.get(peerId);
        if(!seenSet) {
          seen.set(peerId, seenSet = new Set());
        }

        if(!seenSet.has(mid)) {
          const isSelected = this.isMidSelected(peerId, mid);
          if(selecting === undefined) {
            //bubblesContainer.classList.add('no-select');
            selecting = !isSelected;
          }

          seenSet.add(mid);

          if((selecting && !isSelected) || (!selecting && isSelected)) {
            const seenLength = accumulateMapSet(seen);
            if(this.toggleByElement && checkBetween) {
              if(seenLength < 2) {
                if(findUpAsChild(element, firstTarget)) {
                  firstTarget = element;
                }
              }

              const elementsBetween = getElementsBetween(firstTarget, element);
              // console.log(elementsBetween);
              if(elementsBetween.length) {
                elementsBetween.forEach(element => {
                  processElement(element, false);
                });
              }
            }

            if(!this.selectedMids.size) {
              if(seenLength === 2 && this.toggleByMid) {
                for(const [peerId, mids] of seen) {
                  for(const mid of mids) {
                    this.toggleByMid(peerId, mid);
                  }
                }
              }
            } else if(this.toggleByElement) {
              this.toggleByElement(element);
            }
          }
        }
      };

      //const foundTargets: Map<HTMLElement, true> = new Map();
      let canceledSelection = false;
      const onMouseMove = (e: MouseEvent) => {
        if(!canceledSelection) {
          cancelSelection();
          canceledSelection = true;
        }
        /* if(!good) {
          if(Math.abs(e.x - x) > MIN_CLICK_MOVE || Math.abs(e.y - y) > MIN_CLICK_MOVE) {
            good = true;
          } else {
            return;
          }
        } */

        /* if(foundTargets.has(e.target as HTMLElement)) return;
        foundTargets.set(e.target as HTMLElement, true); */
        const element = this.getElementFromTarget(e.target as HTMLElement);
        if(!element) {
          //console.error('found no bubble', e);
          return;
        }

        if(this.verifyMouseMoveTarget && !this.verifyMouseMoveTarget(e, element, selecting)) {
          this.listenerSetter.removeManual(this.listenElement, 'mousemove', onMouseMove);
          this.listenerSetter.removeManual(document, 'mouseup', onMouseUp, documentListenerOptions);
          return;
        }

        processElement(element);
      };

      const onMouseUp = (e: MouseEvent) => {
        if(seen.size) {
          attachClickEvent(window, cancelEvent, {capture: true, once: true, passive: false});
        }

        this.listenerSetter.removeManual(this.listenElement, 'mousemove', onMouseMove);
        //bubblesContainer.classList.remove('no-select');

        // ! CANCEL USER SELECTION !
        cancelSelection();
      };

      const documentListenerOptions = {once: true};
      this.listenerSetter.add(this.listenElement)('mousemove', onMouseMove);
      this.listenerSetter.add(document)('mouseup', onMouseUp, documentListenerOptions);
    });
  }

  protected isElementShouldBeSelected(element: HTMLElement) {
    return this.isMidSelected(element.dataset.peerId.toPeerId(), +element.dataset.mid);
  }

  protected appendCheckbox(element: HTMLElement, checkboxField: CheckboxField) {
    element.prepend(checkboxField.label);
  }

  public toggleElementCheckbox(element: HTMLElement, show: boolean) {
    const hasCheckbox = !!this.getCheckboxInputFromElement(element);
    if(show) {
      if(hasCheckbox) {
        return false;
      }
      
      const checkboxField = new CheckboxField({
        name: element.dataset.mid, 
        round: true
      });
      
      // * if it is a render of new message
      if(this.isSelecting) { // ! avoid breaking animation on start
        if(this.isElementShouldBeSelected(element)) {
          checkboxField.input.checked = true;
          element.classList.add('is-selected');
        }
      }
      
      this.appendCheckbox(element, checkboxField);
    } else if(hasCheckbox) {
      this.getCheckboxInputFromElement(element).parentElement.remove();
    }

    return true;
  }

  protected getCheckboxInputFromElement(element: HTMLElement): HTMLInputElement {
    return element.firstElementChild?.tagName === 'LABEL' && 
      element.firstElementChild.firstElementChild as HTMLInputElement;
  }

  protected updateContainer(forceSelection = false) {
    const size = this.selectedMids.size;
    if(!size && !forceSelection) return;
    
    let cantForward = !size, 
      cantDelete = !size, 
      cantSend = !size;
    for(const [peerId, mids] of this.selectedMids) {
      const storage = this.isScheduled ? this.appMessagesManager.getScheduledMessagesStorage(peerId) : this.appMessagesManager.getMessagesStorage(peerId);
      for(const mid of mids) {
        const message = this.appMessagesManager.getMessageFromStorage(storage, mid);
        if(!cantForward) {
          cantForward = !this.appMessagesManager.canForward(message);
        }
        
        if(!cantDelete) {
          cantDelete = !this.appMessagesManager.canDeleteMessage(message);
        }

        if(cantForward && cantDelete) break;
      }

      if(cantForward && cantDelete) break;
    }
    
    this.onUpdateContainer && this.onUpdateContainer(cantForward, cantDelete, cantSend);
  }

  public toggleSelection(toggleCheckboxes = true, forceSelection = false) {
    const wasSelecting = this.isSelecting;
    const size = this.selectedMids.size;
    this.isSelecting = !!size || forceSelection;

    if(wasSelecting === this.isSelecting) return false;

    this.dispatchEvent('toggle', this.isSelecting);
    
    // const bubblesContainer = this.bubbles.bubblesContainer;
    //bubblesContainer.classList.toggle('is-selecting', !!size);

    /* if(bubblesContainer.classList.contains('is-chat-input-hidden')) {
      const scrollable = this.appImManager.scrollable;
      if(scrollable.isScrolledDown) {
        scrollable.scrollTo(scrollable.scrollHeight, 'top', true, true, 200);
      }
    } */

    if(!IS_TOUCH_SUPPORTED) {
      this.listenElement.classList.toggle('no-select', this.isSelecting);

      if(wasSelecting) {
        // ! CANCEL USER SELECTION !
        cancelSelection();
      }
    }/*  else {
      if(!wasSelecting) {
        bubblesContainer.classList.add('no-select');
        setTimeout(() => {
          cancelSelection();
          bubblesContainer.classList.remove('no-select');
          cancelSelection();
        }, 100);
      }
    } */

    blurActiveElement();

    const forwards = !!size || forceSelection;
    this.onToggleSelection && this.onToggleSelection(forwards, !this.doNotAnimate);

    if(!IS_MOBILE_SAFARI) {
      if(forwards) {
        appNavigationController.pushItem({
          type: this.navigationType,
          onPop: () => {
            this.cancelSelection();
          }
        });
      } else {
        appNavigationController.removeByType(this.navigationType);
      }
    }

    if(forceSelection) {
      this.updateContainer(forceSelection);
    }

    return true;
  }

  public cancelSelection = (doNotAnimate?: boolean) => {
    if(doNotAnimate) this.doNotAnimate = true;
    this.onCancelSelection && this.onCancelSelection();
    this.selectedMids.clear();
    this.toggleSelection();
    cancelSelection();
    if(doNotAnimate) this.doNotAnimate = undefined;
  };

  public cleanup() {
    this.doNotAnimate = true;
    this.selectedMids.clear();
    this.toggleSelection(false);
    this.doNotAnimate = undefined;
  }

  protected updateElementSelection(element: HTMLElement, isSelected: boolean) {
    this.toggleElementCheckbox(element, true);
    const input = this.getCheckboxInputFromElement(element);
    input.checked = isSelected;

    this.toggleSelection();
    this.updateContainer();
    SetTransition(element, 'is-selected', isSelected, 200);
  }

  public isMidSelected(peerId: PeerId, mid: number) {
    const set = this.selectedMids.get(peerId);
    return set?.has(mid);
  }

  public length() {
    return accumulateMapSet(this.selectedMids);
  }

  protected toggleMid(peerId: PeerId, mid: number, unselect?: boolean) {
    let set = this.selectedMids.get(peerId);
    if(unselect || (unselect === undefined && set?.has(mid))) {
      if(set) {
        set.delete(mid);

        if(!set.size) {
          this.selectedMids.delete(peerId);
        }
      }
    } else {
      const diff = rootScope.config.forwarded_count_max - this.length() - 1;
      if(diff < 0) {
        toast(I18n.format('Chat.Selection.LimitToast', true));
        return false;
        /* const it = this.selectedMids.values();
        do {
          const mid = it.next().value;
          const mounted = this.appImManager.getMountedBubble(mid);
          if(mounted) {
            this.toggleByBubble(mounted.bubble);
          } else {
            const mids = this.appMessagesManager.getMidsByMid(mid);
            for(const mid of mids) {
              this.selectedMids.delete(mid);
            }
          }
        } while(this.selectedMids.size > MAX_SELECTION_LENGTH); */
      }

      if(!set) {
        set = new Set();
        this.selectedMids.set(peerId, set);
      }

      set.add(mid);
    }

    return true;
  }

  /**
   * ! Call this method only to handle deleted messages
   */
  public deleteSelectedMids(peerId: PeerId, mids: number[]) {
    const set = this.selectedMids.get(peerId);
    if(!set) {
      return;
    }

    mids.forEach(mid => {
      set.delete(mid);
    });

    if(!set.size) {
      this.selectedMids.delete(peerId);
    }

    this.updateContainer();
    this.toggleSelection();
  }
}

export class SearchSelection extends AppSelection {
  protected selectionContainer: HTMLElement;
  protected selectionCountEl: HTMLElement;
  public selectionForwardBtn: HTMLElement;
  public selectionDeleteBtn: HTMLElement;
  public selectionGotoBtn: HTMLElement;

  private isPrivate: boolean;

  constructor(private searchSuper: AppSearchSuper, appMessagesManager: AppMessagesManager) {
    super({
      appMessagesManager,
      listenElement: searchSuper.container,
      listenerSetter: new ListenerSetter(),
      verifyTarget: (e, target) => !!target && this.isSelecting,
      getElementFromTarget: (target) => findUpClassName(target, 'search-super-item'),
      targetLookupClassName: 'search-super-item',
      lookupBetweenParentClassName: 'tabs-tab',
      lookupBetweenElementsQuery: '.search-super-item'
    });

    this.isPrivate = !searchSuper.showSender;
  }

  /* public appendCheckbox(element: HTMLElement, checkboxField: CheckboxField) {
    checkboxField.label.classList.add('bubble-select-checkbox');

    if(element.classList.contains('document') || element.tagName === 'AUDIO-ELEMENT') {
      element.querySelector('.document, audio-element').append(checkboxField.label);
    } else {
      super.appendCheckbox(bubble, checkboxField);
    }
  } */

  public toggleSelection(toggleCheckboxes = true, forceSelection = false) {
    const ret = super.toggleSelection(toggleCheckboxes, forceSelection);

    if(ret && toggleCheckboxes) {
      const elements = Array.from(this.searchSuper.tabsContainer.querySelectorAll('.search-super-item')) as HTMLElement[];
      elements.forEach(element => {
        this.toggleElementCheckbox(element, this.isSelecting);
      });
    }

    return ret;
  }

  public toggleByElement = (element: HTMLElement) => {
    const mid = +element.dataset.mid;
    const peerId = element.dataset.peerId.toPeerId();

    if(!this.toggleMid(peerId, mid)) {
      return;
    }

    this.updateElementSelection(element, this.isMidSelected(peerId, mid));
  };

  public toggleByMid = (peerId: PeerId, mid: number) => {
    const element = this.searchSuper.mediaTab.contentTab.querySelector(`.search-super-item[data-peer-id="${peerId}"][data-mid="${mid}"]`) as HTMLElement;
    this.toggleByElement(element);
  };

  protected onUpdateContainer = (cantForward: boolean, cantDelete: boolean, cantSend: boolean) => {
    const length = this.length();
    replaceContent(this.selectionCountEl, i18n('messages', [length]));
    this.selectionGotoBtn.classList.toggle('hide', length !== 1);
    this.selectionForwardBtn.classList.toggle('hide', cantForward);
    this.selectionDeleteBtn && this.selectionDeleteBtn.classList.toggle('hide', cantDelete);
  };

  protected onToggleSelection = (forwards: boolean, animate: boolean) => {
    SetTransition(this.searchSuper.navScrollableContainer, 'is-selecting', forwards, animate ? 200 : 0, () => {
      if(!this.isSelecting) {
        this.selectionContainer.remove();
        this.selectionContainer = 
          this.selectionForwardBtn = 
          this.selectionDeleteBtn = 
          null;
        this.selectedText = undefined;
      }
    });

    SetTransition(this.searchSuper.container, 'is-selecting', forwards, 200);

    if(this.isSelecting) {
      if(!this.selectionContainer) {
        const BASE_CLASS = 'search-super-selection';
        this.selectionContainer = document.createElement('div');
        this.selectionContainer.classList.add(BASE_CLASS + '-container');

        const btnCancel = ButtonIcon(`close ${BASE_CLASS}-cancel`, {noRipple: true});
        this.listenerSetter.add(btnCancel)('click', () => this.cancelSelection(), {once: true});

        this.selectionCountEl = document.createElement('div');
        this.selectionCountEl.classList.add(BASE_CLASS + '-count');

        this.selectionGotoBtn = ButtonIcon(`message ${BASE_CLASS}-goto`);

        const attachClickOptions: AttachClickOptions = {listenerSetter: this.listenerSetter};
        attachClickEvent(this.selectionGotoBtn, () => {
          const peerId = [...this.selectedMids.keys()][0];
          const mid = [...this.selectedMids.get(peerId)][0];
          this.cancelSelection();

          rootScope.dispatchEvent('history_focus', {
            peerId,
            mid
          });
        }, attachClickOptions);

        this.selectionForwardBtn = ButtonIcon(`forward ${BASE_CLASS}-forward`);
        attachClickEvent(this.selectionForwardBtn, () => {
          const obj: {[fromPeerId: PeerId]: number[]} = {};
          for(const [fromPeerId, mids] of this.selectedMids) {
            obj[fromPeerId] = Array.from(mids).sort((a, b) => a - b);
          }

          new PopupForward(obj, () => {
            this.cancelSelection();
          });
        }, attachClickOptions);

        if(this.isPrivate) {
          this.selectionDeleteBtn = ButtonIcon(`delete danger ${BASE_CLASS}-delete`);
          attachClickEvent(this.selectionDeleteBtn, () => {
            const peerId = [...this.selectedMids.keys()][0];
            new PopupDeleteMessages(peerId, [...this.selectedMids.get(peerId)], 'chat', () => {
              this.cancelSelection();
            });
          }, attachClickOptions);
        }

        this.selectionContainer.append(...[
          btnCancel, 
          this.selectionCountEl, 
          this.selectionGotoBtn, 
          this.selectionForwardBtn, 
          this.selectionDeleteBtn
        ].filter(Boolean));

        const transitionElement = this.selectionContainer;
        transitionElement.style.opacity = '0';
        this.searchSuper.navScrollableContainer.append(transitionElement);

        void transitionElement.offsetLeft; // reflow
        transitionElement.style.opacity = '';
      }
    }
  };
}

export default class ChatSelection extends AppSelection {
  protected selectionInputWrapper: HTMLElement;
  protected selectionContainer: HTMLElement;
  protected selectionCountEl: HTMLElement;
  public selectionSendNowBtn: HTMLElement;
  public selectionForwardBtn: HTMLElement;
  public selectionDeleteBtn: HTMLElement;
  private selectionLeft: HTMLDivElement;
  private selectionRight: HTMLDivElement;

  constructor(private chat: Chat, private bubbles: ChatBubbles, private input: ChatInput, appMessagesManager: AppMessagesManager) {
    super({
      appMessagesManager,
      listenElement: bubbles.bubblesContainer,
      listenerSetter: bubbles.listenerSetter,
      getElementFromTarget: (target) => findUpClassName(target, 'grouped-item') || findUpClassName(target, 'bubble'),
      verifyTarget: (e, target) => {
        // LEFT BUTTON
        // проверка внизу нужна для того, чтобы не активировать селект если target потомок .bubble
        const bad = !this.selectedMids.size 
          && !(e.target as HTMLElement).classList.contains('bubble')
          && !(e.target as HTMLElement).classList.contains('document-selection')
          && target;

        return !bad;
      },
      verifyMouseMoveTarget: (e, element, selecting) => {
        const bad = e.target !== element && 
          !(e.target as HTMLElement).classList.contains('document-selection') && 
          selecting === undefined && 
          !this.selectedMids.size;
        return !bad;
      },
      verifyTouchLongPress: () => !this.chat.input.recording,
      targetLookupClassName: 'bubble',
      lookupBetweenParentClassName: 'bubbles-inner',
      lookupBetweenElementsQuery: '.bubble:not(.is-multiple-documents), .grouped-item',
      isScheduled: chat.type === 'scheduled'
    });
  }

  public appendCheckbox(bubble: HTMLElement, checkboxField: CheckboxField) {
    checkboxField.label.classList.add('bubble-select-checkbox');

    if(bubble.classList.contains('document-container')) {
      bubble.querySelector('.document, audio-element').append(checkboxField.label);
    } else {
      super.appendCheckbox(bubble, checkboxField);
    }
  }

  public toggleSelection(toggleCheckboxes = true, forceSelection = false) {
    const ret = super.toggleSelection(toggleCheckboxes, forceSelection);

    if(ret && toggleCheckboxes) {
      for(const mid in this.bubbles.bubbles) {
        const bubble = this.bubbles.bubbles[mid];
        this.toggleElementCheckbox(bubble, this.isSelecting);
      }
    }

    return ret;
  }

  public toggleElementCheckbox(bubble: HTMLElement, show: boolean) {
    if(!this.canSelectBubble(bubble)) return;

    const ret = super.toggleElementCheckbox(bubble, show);
    if(ret) {
      const isGrouped = bubble.classList.contains('is-grouped');
      if(isGrouped) {
        this.bubbles.getBubbleGroupedItems(bubble).forEach(item => this.toggleElementCheckbox(item, show));
      }
    }
    
    return ret;
  }

  public toggleByElement = (bubble: HTMLElement) => {
    if(!this.canSelectBubble(bubble)) return;

    const mid = +bubble.dataset.mid;

    const isGrouped = bubble.classList.contains('is-grouped');
    if(isGrouped) {
      if(!this.isGroupedBubbleSelected(bubble)) {
        const set = this.selectedMids.get(this.bubbles.peerId);
        if(set) {
          const mids = this.chat.getMidsByMid(mid);
          mids.forEach(mid => set.delete(mid));
        }
      }

      this.bubbles.getBubbleGroupedItems(bubble).forEach(this.toggleByElement);
      return;
    }

    if(!this.toggleMid(this.bubbles.peerId, mid)) {
      return;
    }

    const isGroupedItem = bubble.classList.contains('grouped-item');
    if(isGroupedItem) {
      const groupContainer = findUpClassName(bubble, 'bubble');
      const isGroupedSelected = this.isGroupedBubbleSelected(groupContainer);
      const isGroupedMidsSelected = this.isGroupedMidsSelected(mid);

      const willChange = isGroupedMidsSelected || isGroupedSelected;
      if(willChange) {
        this.updateElementSelection(groupContainer, isGroupedMidsSelected);
      }
    }

    this.updateElementSelection(bubble, this.isMidSelected(this.bubbles.peerId, mid));
  };

  protected toggleByMid = (peerId: PeerId, mid: number) => {
    const mounted = this.bubbles.getMountedBubble(mid);
    if(mounted) {
      this.toggleByElement(mounted.bubble);
    }
  };

  public isElementShouldBeSelected(element: HTMLElement) {
    const isGrouped = element.classList.contains('is-grouped');
    return super.isElementShouldBeSelected(element) && (!isGrouped || this.isGroupedMidsSelected(+element.dataset.mid));
  }

  protected isGroupedBubbleSelected(bubble: HTMLElement) {
    const groupedCheckboxInput = this.getCheckboxInputFromElement(bubble);
    return groupedCheckboxInput?.checked;
  }

  protected isGroupedMidsSelected(mid: number) {
    const mids = this.chat.getMidsByMid(mid);
    const selectedMids = mids.filter(mid => this.isMidSelected(this.bubbles.peerId, mid));
    return mids.length === selectedMids.length;
  }

  protected getCheckboxInputFromElement(bubble: HTMLElement) {
    /* let perf = performance.now();
    let checkbox = bubble.firstElementChild.tagName === 'LABEL' && bubble.firstElementChild.firstElementChild as HTMLInputElement;
    console.log('getCheckboxInputFromBubble firstElementChild time:', performance.now() - perf);
  
    perf = performance.now();
    checkbox = bubble.querySelector('label input');
    console.log('getCheckboxInputFromBubble querySelector time:', performance.now() - perf); */
    /* let perf = performance.now();
    let contains = bubble.classList.contains('document-container');
    console.log('getCheckboxInputFromBubble classList time:', performance.now() - perf);
  
    perf = performance.now();
    contains = bubble.className.includes('document-container');
    console.log('getCheckboxInputFromBubble className time:', performance.now() - perf); */
  
    return bubble.classList.contains('document-container') ? 
      bubble.querySelector('label input') as HTMLInputElement : 
      super.getCheckboxInputFromElement(bubble);
  }

  public canSelectBubble(bubble: HTMLElement) {
    return !bubble.classList.contains('service') && 
      !bubble.classList.contains('is-outgoing') && 
      !bubble.classList.contains('bubble-first') && 
      !bubble.classList.contains('avoid-selection');
  }

  protected onToggleSelection = (forwards: boolean, animate: boolean) => {
    const {needTranslateX, widthFrom, widthTo} = this.chat.input.center(animate);

    SetTransition(this.listenElement, 'is-selecting', forwards, animate ? 200 : 0, () => {
      if(!this.isSelecting) {
        this.selectionInputWrapper.remove();
        this.selectionInputWrapper = 
          this.selectionContainer = 
          this.selectionSendNowBtn = 
          this.selectionForwardBtn = 
          this.selectionDeleteBtn = 
          this.selectionLeft = 
          this.selectionRight = 
          null;
        this.selectedText = undefined;
      }
      
      /* fastRaf(() => {
        this.bubbles.onScroll();
      }); */
    });

    //const chatInput = this.appImManager.chatInput;

    const translateButtonsX = widthFrom < widthTo ? undefined : needTranslateX * 2;
    if(this.isSelecting) {
      if(!this.selectionContainer) {
        this.selectionInputWrapper = document.createElement('div');
        this.selectionInputWrapper.classList.add('chat-input-wrapper', 'selection-wrapper');

        // const background = document.createElement('div');
        // background.classList.add('chat-input-wrapper-background');

        this.selectionContainer = document.createElement('div');
        this.selectionContainer.classList.add('selection-container');

        const attachClickOptions: AttachClickOptions = {listenerSetter: this.listenerSetter};
        const btnCancel = ButtonIcon('close', {noRipple: true});
        attachClickEvent(btnCancel, () => this.cancelSelection(), {once: true, listenerSetter: this.listenerSetter});

        this.selectionCountEl = document.createElement('div');
        this.selectionCountEl.classList.add('selection-container-count');

        if(this.chat.type === 'scheduled') {
          this.selectionSendNowBtn = Button('btn-primary btn-transparent btn-short text-bold selection-container-send', {icon: 'send2'});
          this.selectionSendNowBtn.append(i18n('MessageScheduleSend'));
          attachClickEvent(this.selectionSendNowBtn, () => {
            new PopupSendNow(this.bubbles.peerId, [...this.selectedMids.get(this.bubbles.peerId)], () => {
              this.cancelSelection();
            });
          }, attachClickOptions);
        } else {
          this.selectionForwardBtn = Button('btn-primary btn-transparent text-bold selection-container-forward', {icon: 'forward'});
          this.selectionForwardBtn.append(i18n('Forward'));
          attachClickEvent(this.selectionForwardBtn, () => {
            const obj: {[fromPeerId: PeerId]: number[]} = {};
            for(const [fromPeerId, mids] of this.selectedMids) {
              obj[fromPeerId] = Array.from(mids).sort((a, b) => a - b);
            }

            new PopupForward(obj, () => {
              this.cancelSelection();
            });
          }, attachClickOptions);
        }

        this.selectionDeleteBtn = Button('btn-primary btn-transparent danger text-bold selection-container-delete', {icon: 'delete'});
        this.selectionDeleteBtn.append(i18n('Delete'));
        attachClickEvent(this.selectionDeleteBtn, () => {
          new PopupDeleteMessages(this.bubbles.peerId, [...this.selectedMids.get(this.bubbles.peerId)], this.chat.type, () => {
            this.cancelSelection();
          });
        }, attachClickOptions);

        const left = this.selectionLeft = document.createElement('div');
        left.classList.add('selection-container-left');
        left.append(btnCancel, this.selectionCountEl);

        const right = this.selectionRight = document.createElement('div');
        right.classList.add('selection-container-right');
        right.append(...[
          this.selectionSendNowBtn, 
          this.selectionForwardBtn, 
          this.selectionDeleteBtn
        ].filter(Boolean))

        if(translateButtonsX !== undefined) {
          left.style.transform = `translateX(${-translateButtonsX}px)`;
          right.style.transform = `translateX(${translateButtonsX}px)`;
        }

        this.selectionContainer.append(left, right);

        // background.style.opacity = '0';
        this.selectionInputWrapper.style.opacity = '0';
        this.selectionInputWrapper.append(/* background,  */this.selectionContainer);
        this.input.inputContainer.append(this.selectionInputWrapper);
        
        void this.selectionInputWrapper.offsetLeft; // reflow
        // background.style.opacity = '';
        this.selectionInputWrapper.style.opacity = '';
        left.style.transform = '';
        right.style.transform = '';
      }
    } else if(this.selectionLeft && translateButtonsX !== undefined) {
      this.selectionLeft.style.transform = `translateX(-${translateButtonsX}px)`;
      this.selectionRight.style.transform = `translateX(${translateButtonsX}px)`;
    }
  };

  protected onUpdateContainer = (cantForward: boolean, cantDelete: boolean, cantSend: boolean) => {
    replaceContent(this.selectionCountEl, i18n('messages', [this.length()]));
    this.selectionSendNowBtn && this.selectionSendNowBtn.toggleAttribute('disabled', cantSend);
    this.selectionForwardBtn && this.selectionForwardBtn.toggleAttribute('disabled', cantForward);
    this.selectionDeleteBtn.toggleAttribute('disabled', cantDelete);
  };

  protected onCancelSelection = () => {
    for(const [peerId, mids] of this.selectedMids) {
      for(const mid of mids) {
        const mounted = this.bubbles.getMountedBubble(mid);
        if(mounted) {
          //this.toggleByBubble(mounted.message.grouped_id ? mounted.bubble.querySelector(`.grouped-item[data-mid="${mid}"]`) : mounted.bubble);
          this.toggleByElement(mounted.bubble);
        }
        /* const bubble = this.appImManager.bubbles[mid];
        if(bubble) {
          this.toggleByBubble(bubble);
        } */
      }
    }
  };
}
