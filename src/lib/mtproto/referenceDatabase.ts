/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { RefreshReferenceTask, RefreshReferenceTaskResponse } from "./apiFileManager";
import appMessagesManager from "../appManagers/appMessagesManager";
import appStickersManager from "../appManagers/appStickersManager";
import { Photo } from "../../layer";
import { MOUNT_CLASS_TO } from "../../config/debug";
import apiManager from "./mtprotoworker";
import assumeType from "../../helpers/assumeType";
import { logger } from "../logger";
import bytesToHex from "../../helpers/bytes/bytesToHex";
import deepEqual from "../../helpers/object/deepEqual";

export type ReferenceContext = ReferenceContext.referenceContextProfilePhoto | ReferenceContext.referenceContextMessage | ReferenceContext.referenceContextEmojiesSounds | ReferenceContext.referenceContextReactions;
export namespace ReferenceContext {
  export type referenceContextProfilePhoto = {
    type: 'profilePhoto',
    peerId: PeerId
  };

  export type referenceContextMessage = {
    type: 'message',
    peerId: PeerId,
    messageId: number
  };

  export type referenceContextEmojiesSounds = {
    type: 'emojiesSounds'
  };

  export type referenceContextReactions = {
    type: 'reactions'
  };
}

export type ReferenceBytes = Photo.photo['file_reference'];
export type ReferenceContexts = Set<ReferenceContext>;

//type ReferenceBytes = Uint8Array;

class ReferenceDatabase {
  private contexts: Map<ReferenceBytes, ReferenceContexts> = new Map();
  //private references: Map<ReferenceBytes, number[]> = new Map();
  private links: {[hex: string]: ReferenceBytes} = {};
  private log = logger('RD', undefined, true);
  private refreshEmojiesSoundsPromise: Promise<any>;

  constructor() {
    apiManager.addTaskListener('refreshReference', (task: RefreshReferenceTask) => {
      const originalPayload = task.payload;

      assumeType<RefreshReferenceTaskResponse>(task);
      task.originalPayload = originalPayload;

      this.refreshReference(originalPayload).then((bytes) => {
        task.payload = bytes;
      }, (err) => {
        task.error = err;
      }).then(() => apiManager.postMessage(task));
    });
  }

  public saveContext(reference: ReferenceBytes, context: ReferenceContext, contexts?: ReferenceContexts) {
    [contexts, reference] = this.getContexts(reference);
    if(!contexts) {
      contexts = new Set();
      this.contexts.set(reference, contexts);
    }
    
    this.links[bytesToHex(reference)] = reference;
    for(const _context of contexts) {
      if(deepEqual(_context, context)) {
        return;
      }
    }

    contexts.add(context);
  }

  public getReferenceByLink(reference: ReferenceBytes) {
    return this.links[bytesToHex(reference)];
  }

  public getContexts(reference: ReferenceBytes): [ReferenceContexts, ReferenceBytes] {
    const contexts = this.contexts.get(reference) || (reference = this.getReferenceByLink(reference) || reference, this.contexts.get(reference));
    return [contexts, reference];
  }

  public getContext(reference: ReferenceBytes): [ReferenceContext, ReferenceBytes] {
    const contexts = this.getContexts(reference);
    return contexts[0] ? [contexts[0].values().next().value, contexts[1]] : undefined;
  }

  public deleteContext(reference: ReferenceBytes, context: ReferenceContext, contexts?: ReferenceContexts) {
    [contexts, reference] = this.getContexts(reference);
    if(contexts) {
      for(const _context of contexts) {
        if(deepEqual(_context, context)) {
          contexts.delete(_context);
          if(!contexts.size) {
            this.contexts.delete(reference);
            delete this.links[bytesToHex(reference)];
          }
          return true;
        }
      }
    }

    return false;
  }

  public refreshReference(reference: ReferenceBytes, context?: ReferenceContext): Promise<Uint8Array | number[]> {
    this.log('refreshReference: start', reference.slice(), context);
    if(!context) {
      const c = this.getContext(reference);
      if(!c) {
        this.log('refreshReference: got no context for reference:', reference.slice());
        return Promise.reject('NO_CONTEXT');
      }

      [context, reference] = c;
    }

    let promise: Promise<any>;
    switch(context?.type) {
      case 'message': {
        promise = appMessagesManager.wrapSingleMessage(context.peerId, context.messageId, true);
        break; 
        // .then(() => {
        //   console.log('FILE_REFERENCE_EXPIRED: got message', context, appMessagesManager.getMessage((context as ReferenceContext.referenceContextMessage).messageId).media, reference);
        // });
      }

      case 'emojiesSounds': {
        promise = this.refreshEmojiesSoundsPromise || appStickersManager.getAnimatedEmojiSounds(true).then(() => {
          this.refreshEmojiesSoundsPromise = undefined;
        });
        break;
      }

      default: {
        this.log.warn('refreshReference: not implemented context', context);
        return Promise.reject();
      }
    }

    const hex = bytesToHex(reference);
    this.log('refreshReference: refreshing reference:', hex);
    return promise.then(() => {
      const newHex = bytesToHex(reference);
      this.log('refreshReference: refreshed, reference before:', hex, 'after:', newHex);
      if(hex !== newHex) {
        return reference;
      }

      this.deleteContext(reference, context);

      const newContext = this.getContext(reference);
      if(newContext) {
        return this.refreshReference(reference, newContext[0]);
      }

      this.log.error('refreshReference: no new context, reference before:', hex, 'after:', newHex, context);

      throw 'NO_NEW_CONTEXT';
    });
  }

  /* public replaceReference(oldReference: ReferenceBytes, newReference: ReferenceBytes) {
    const contexts = this.contexts.get(oldReference);
    if(contexts) {
      this.contexts.delete(oldReference);
      this.contexts.set(newReference, contexts);
    }
  } */
}

const referenceDatabase = new ReferenceDatabase();
MOUNT_CLASS_TO.referenceDatabase = referenceDatabase;
export default referenceDatabase;