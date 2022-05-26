/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 * 
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import { toast } from "../../components/toast";
import { BotInlineResult, GeoPoint, InputGeoPoint, InputMedia, MessageEntity, MessagesBotResults, ReplyMarkup } from "../../layer";
import appPeersManager from "./appPeersManager";
import apiManagerProxy from "../mtproto/mtprotoworker";
import { RichTextProcessor } from "../richtextprocessor";
import appDocsManager, { MyDocument } from "./appDocsManager";
import appPhotosManager, { MyPhoto } from "./appPhotosManager";
import appUsersManager, { MyTopPeer } from "./appUsersManager";
import appMessagesManager from "./appMessagesManager";
import { MOUNT_CLASS_TO } from "../../config/debug";
import rootScope from "../rootScope";
import appDraftsManager from "./appDraftsManager";
import appMessagesIdsManager from "./appMessagesIdsManager";
import appStateManager from "./appStateManager";
import insertInDescendSortedArray from "../../helpers/array/insertInDescendSortedArray";

export class AppInlineBotsManager {
  private inlineResults: {[queryAndResultIds: string]: BotInlineResult} = {};
  private setHash: {
    [botId: UserId]: {
      peerId: PeerId, 
      time: number
    }
  } = {};

  public getGeoInput(geo: GeoPoint): InputGeoPoint {
    return geo._ === 'geoPoint' ? {
      _: 'inputGeoPoint',
      lat: geo.lat,
      long: geo.long,
      accuracy_radius: geo.accuracy_radius
    } : {
      _: 'inputGeoPointEmpty'
    };
  }

  public getInlineResults(peerId: PeerId, botId: BotId, query = '', offset = '', geo?: GeoPoint) {
    return apiManagerProxy.invokeApi('messages.getInlineBotResults', {
      bot: appUsersManager.getUserInput(botId),
      peer: appPeersManager.getInputPeerById(peerId),
      query,
      geo_point: geo ? this.getGeoInput(geo) : undefined,
      offset
    }, {/* timeout: 1,  */stopTime: -1, noErrorBox: true}).then(botResults => {
      const queryId = botResults.query_id;

      /* if(botResults.switch_pm) {
        botResults.switch_pm.rText = RichTextProcessor.wrapRichText(botResults.switch_pm.text, {noLinebreaks: true, noLinks: true});
      } */
      
      botResults.results.forEach(result => {
        if(result._ === 'botInlineMediaResult') {
          if(result.document) {
            result.document = appDocsManager.saveDoc(result.document);
          }
          
          if(result.photo) {
            result.photo = appPhotosManager.savePhoto(result.photo);
          }
        }
        
        this.inlineResults[this.generateQId(queryId, result.id)] = result;
      });

      return botResults;
    });
  }

  public generateQId(queryId: MessagesBotResults.messagesBotResults['query_id'], resultId: string) {
    return queryId + '_' + resultId;
  }

  private pushPopularBot(botId: BotId) {
    appUsersManager.getTopPeers('bots_inline').then((topPeers) => {
      const botPeerId = botId.toPeerId();
      const index = topPeers.findIndex(topPeer => topPeer.id === botPeerId);
      let topPeer: MyTopPeer;
      if(index !== -1) {
        topPeer = topPeers[index];
      } else {
        topPeer = {
          id: botPeerId,
          rating: 0
        };
      }

      ++topPeer.rating;
      insertInDescendSortedArray(topPeers, topPeer, 'rating');

      appStateManager.setKeyValueToStorage('topPeersCache');
      
      // rootScope.$broadcast('inline_bots_popular')
    });
  }

  public switchToPM(fromPeerId: PeerId, botId: BotId, startParam: string) {
    this.setHash[botId] = {peerId: fromPeerId, time: Date.now()};
    rootScope.dispatchEvent('history_focus', {peerId: botId.toPeerId()});
    return appMessagesManager.startBot(botId, undefined, startParam);
  }
  
  /*
  function resolveInlineMention (username) {
    return AppPeersManager.resolveUsername(username).then(function (peerId) {
      if (peerId.isUser()) {
        var bot = AppUsersManager.getUser(peerId)
        if (bot.pFlags.bot && bot.bot_inline_placeholder !== undefined) {
          var resolvedBot = {
            username: username,
            id: peerId,
            placeholder: bot.bot_inline_placeholder
          }
          if (bot.pFlags.bot_inline_geo &&
            GeoLocationManager.isAvailable()) {
              return checkGeoLocationAccess(peerId).then(function () {
                return GeoLocationManager.getPosition().then(function (coords) {
                  resolvedBot.geo = coords
                  return qSync.when(resolvedBot)
                })
              })['catch'](function () {
                return qSync.when(resolvedBot)
              })
            }
            return qSync.when(resolvedBot)
          }
        }
        return $q.reject()
      }, function (error) {
        error.handled = true
        return $q.reject(error)
      })
    }
    
    function regroupWrappedResults (results, rowW, rowH) {
      if (!results ||
        !results[0] ||
        ['photo', 'gif', 'sticker'].indexOf(results[0].type) === -1) {
          return
        }
        var ratios = []
        angular.forEach(results, function (result) {
          var w
          var h, doc
          var photo
          if (result._ === 'botInlineMediaResult') {
            if (doc = result.document) {
              w = result.document.w
              h = result.document.h
            }
            else if (photo = result.photo) {
              var photoSize = (photo.sizes || [])[0]
              w = photoSize && photoSize.w
              h = photoSize && photoSize.h
            }
          }else {
            w = result.w
            h = result.h
          }
          if (!w || !h) {
            w = h = 1
          }
          ratios.push(w / h)
        })
        
        var rows = []
        var curCnt = 0
        var curW = 0
        angular.forEach(ratios, function (ratio) {
          var w = ratio * rowH
          curW += w
          if (!curCnt || curCnt < 4 && curW < (rowW * 1.1)) {
            curCnt++
          } else {
            rows.push(curCnt)
            curCnt = 1
            curW = w
          }
        })
        if (curCnt) {
          rows.push(curCnt)
        }
        
        var i = 0
        var thumbs = []
        var lastRowI = rows.length - 1
        angular.forEach(rows, function (rowCnt, rowI) {
          var lastRow = rowI === lastRowI
          var curRatios = ratios.slice(i, i + rowCnt)
          var sumRatios = 0
          angular.forEach(curRatios, function (ratio) {
            sumRatios += ratio
          })
          angular.forEach(curRatios, function (ratio, j) {
            var thumbH = rowH
            var thumbW = rowW * ratio / sumRatios
            var realW = thumbH * ratio
            if (lastRow && thumbW > realW) {
              thumbW = realW
            }
            var result = results[i + j]
            result.thumbW = Math.floor(thumbW) - 2
            result.thumbH = Math.floor(thumbH) - 2
          })
          
          i += rowCnt
        })
      } */

  public async checkSwitchReturn(botId: BotId) {
    const bot = appUsersManager.getUser(botId);
    if(!bot || !bot.pFlags.bot || !bot.bot_inline_placeholder) {
      return;
    }

    const peerData = this.setHash[botId];
    if(peerData) {
      delete this.setHash[botId];
      if((Date.now() - peerData.time) < 3600e3) {
        return peerData.peerId;
      }
    }
  }

  public switchInlineQuery(peerId: PeerId, threadId: number, botId: BotId, query: string) {
    rootScope.dispatchEvent('history_focus', {peerId, threadId});
    appDraftsManager.setDraft(peerId, threadId, '@' + appUsersManager.getUser(botId).username + ' ' + query);
  }

  public callbackButtonClick(peerId: PeerId, mid: number, button: any) {
    return apiManagerProxy.invokeApi('messages.getBotCallbackAnswer', {
      peer: appPeersManager.getInputPeerById(peerId),
      msg_id: appMessagesIdsManager.getServerMessageId(mid),
      data: button.data
    }, {/* timeout: 1,  */stopTime: -1, noErrorBox: true}).then((callbackAnswer) => {
      if(typeof callbackAnswer.message === 'string' && callbackAnswer.message.length) {
        toast(RichTextProcessor.wrapRichText(callbackAnswer.message, {noLinks: true, noLinebreaks: true}));
      }
      
      //console.log('callbackButtonClick callbackAnswer:', callbackAnswer);
    });
  }
      
  /* function gameButtonClick (id) {
    var message = AppMessagesManager.getMessage(id)
    var peerId = AppMessagesManager.getMessagePeer(message)
    
    return MtpApiManager.invokeApi('messages.getBotCallbackAnswer', {
      peer: AppPeersManager.getInputPeerByID(peerId),
      msg_id: AppMessagesIDsManager.getMessageLocalID(id)
    }, {timeout: 1, stopTime: -1, noErrorBox: true}).then(function (callbackAnswer) {
      if (typeof callbackAnswer.message === 'string' &&
      callbackAnswer.message.length) {
        showCallbackMessage(callbackAnswer.message, callbackAnswer.pFlags.alert)
      }
      else if (typeof callbackAnswer.url === 'string') {
        AppGamesManager.openGame(message.media.game.id, id, callbackAnswer.url)
      }
    })
  } */

  public sendInlineResult(peerId: PeerId, botId: BotId, queryAndResultIds: string, options: Partial<{
    viaBotId: BotId,
    queryId: string,
    resultId: string,
    replyMarkup: ReplyMarkup,
    entities: MessageEntity[],
    replyToMsgId: number,
    clearDraft: true,
    scheduleDate: number,
    silent: true,
    sendAsPeerId: PeerId,
    geoPoint: GeoPoint
  }> = {}) {
    const inlineResult = this.inlineResults[queryAndResultIds];
    if(!inlineResult) {
      return;
    }

    this.pushPopularBot(botId);
    const splitted = queryAndResultIds.split('_');
    const queryID = splitted.shift();
    const resultID = splitted.join('_');
    options.viaBotId = botId;
    options.queryId = queryID;
    options.resultId = resultID;
    if(inlineResult.send_message.reply_markup) {
      options.replyMarkup = inlineResult.send_message.reply_markup;
    }
    
    if(inlineResult.send_message._ === 'botInlineMessageText') {
      options.entities = inlineResult.send_message.entities;
      appMessagesManager.sendText(peerId, inlineResult.send_message.message, options);
    } else {
      let caption = '';
      let inputMedia: InputMedia;
      const sendMessage = inlineResult.send_message;
      switch(sendMessage._) {
        case 'botInlineMessageMediaAuto': {
          caption = sendMessage.message;

          if(inlineResult._ === 'botInlineMediaResult') {
            const {document, photo} = inlineResult;
            if(document) {
              inputMedia = appDocsManager.getMediaInput(document as MyDocument);
            } else {
              inputMedia = appPhotosManager.getMediaInput(photo as MyPhoto);
            }
          }

          break;
        }

        case 'botInlineMessageMediaGeo': {
          inputMedia = {
            _: 'inputMediaGeoPoint',
            geo_point: this.getGeoInput(sendMessage.geo)
          };

          options.geoPoint = sendMessage.geo;

          break;
        }
        
        case 'botInlineMessageMediaVenue': {
          inputMedia = {
            _: 'inputMediaVenue',
            geo_point: this.getGeoInput(sendMessage.geo),
            title: sendMessage.title,
            address: sendMessage.address,
            provider: sendMessage.provider,
            venue_id: sendMessage.venue_id,
            venue_type: sendMessage.venue_type
          };

          options.geoPoint = sendMessage.geo;

          break;
        }

        case 'botInlineMessageMediaContact': {
          inputMedia = {
            _: 'inputMediaContact',
            phone_number: sendMessage.phone_number,
            first_name: sendMessage.first_name,
            last_name: sendMessage.last_name,
            vcard: sendMessage.vcard
          };

          break;
        }
      }

      if(!inputMedia) {
        inputMedia = {
          _: 'messageMediaPending',
          type: inlineResult.type,
          file_name: inlineResult.title || 
            (inlineResult as BotInlineResult.botInlineResult).content?.url || 
            (inlineResult as BotInlineResult.botInlineResult).url,
          size: 0,
          progress: {percent: 30, total: 0}
        } as any;
      }

      appMessagesManager.sendOther(peerId, inputMedia, options);
    }
  }
  
  /* function checkGeoLocationAccess (botID) {
    var key = 'bot_access_geo' + botID
    return Storage.get(key).then(function (geoAccess) {
      if (geoAccess && geoAccess.granted) {
        return true
      }
      return ErrorService.confirm({
        type: 'BOT_ACCESS_GEO_INLINE'
      }).then(function () {
        var setHash = {}
        setHash[key] = {granted: true, time: tsNow()}
        Storage.set(setHash)
        return true
      }, function () {
        var setHash = {}
        setHash[key] = {denied: true, time: tsNow()}
        Storage.set(setHash)
        return $q.reject()
      })
    })
  } */
}

const appInlineBotsManager = new AppInlineBotsManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appInlineBotsManager = appInlineBotsManager);
export default appInlineBotsManager;
