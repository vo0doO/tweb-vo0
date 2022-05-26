/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { SettingSection } from "..";
import { attachClickEvent } from "../../../helpers/dom/clickEvent";
import replaceContent from "../../../helpers/dom/replaceContent";
import toggleDisability from "../../../helpers/dom/toggleDisability";
import formatBytes from "../../../helpers/formatBytes";
import copy from "../../../helpers/object/copy";
import deepEqual from "../../../helpers/object/deepEqual";
import appStateManager, { AutoDownloadPeerTypeSettings, STATE_INIT } from "../../../lib/appManagers/appStateManager";
import { FormatterArguments, i18n, join, LangPackKey } from "../../../lib/langPack";
import rootScope from "../../../lib/rootScope";
import Button from "../../button";
import CheckboxField from "../../checkboxField";
import confirmationPopup from "../../confirmationPopup";
import Row from "../../row";
import { SliderSuperTabEventable, SliderSuperTabEventableConstructable } from "../../sliderTab";
import AppAutoDownloadFileTab from "./autoDownload/file";
import AppAutoDownloadPhotoTab from "./autoDownload/photo";
import AppAutoDownloadVideoTab from "./autoDownload/video";

const AUTO_DOWNLOAD_FOR_KEYS: {[k in keyof AutoDownloadPeerTypeSettings]: LangPackKey} = {
  contacts: 'AutoDownloadContacts',
  private: 'AutoDownloadPm',
  groups: 'AutoDownloadGroups',
  channels: 'AutoDownloadChannels'
};

export default class AppDataAndStorageTab extends SliderSuperTabEventable {
  protected async init() {
    this.header.classList.add('with-border');
    this.setTitle('DataSettings');

    {
      const section = new SettingSection({name: 'AutomaticMediaDownload', caption: 'AutoDownloadAudioInfo'});

      const state = await appStateManager.getState();

      const autoCheckboxField = new CheckboxField({
        text: 'AutoDownloadMedia', 
        name: 'auto',
        checked: !state.settings.autoDownloadNew.pFlags.disabled,
        withRipple: true
      });

      const onChange = () => {
        toggleDisability([resetButton], 
          deepEqual(state.settings.autoDownload, STATE_INIT.settings.autoDownload) && 
          deepEqual(state.settings.autoDownloadNew, STATE_INIT.settings.autoDownloadNew));
      };

      const setSubtitles = () => {
        this.setAutoDownloadSubtitle(photoRow, state.settings.autoDownload.photo, /* state.settings.autoDownloadNew.photo_size_max */);
        this.setAutoDownloadSubtitle(videoRow, state.settings.autoDownload.video/* , state.settings.autoDownloadNew.video_size_max */);
        this.setAutoDownloadSubtitle(fileRow, state.settings.autoDownload.file, state.settings.autoDownloadNew.file_size_max);
      };

      const openTab = (tabConstructor: SliderSuperTabEventableConstructable) => {
        const tab = new tabConstructor(this.slider, true);
        tab.open();

        this.listenerSetter.add(tab.eventListener)('destroy', () => {
          setSubtitles();
          onChange();
        }, {once: true});
      };
      
      const photoRow = new Row({
        titleLangKey: 'AutoDownloadPhotos',
        subtitle: '',
        clickable: () => {
          openTab(AppAutoDownloadPhotoTab);
        }
      });

      const videoRow = new Row({
        titleLangKey: 'AutoDownloadVideos',
        subtitle: '',
        clickable: () => {
          openTab(AppAutoDownloadVideoTab);
        }
      });

      const fileRow = new Row({
        titleLangKey: 'AutoDownloadFiles',
        subtitle: '',
        clickable: () => {
          openTab(AppAutoDownloadFileTab);
        }
      });

      const resetButton = Button('btn-primary btn-transparent primary', {icon: 'delete', text: 'ResetAutomaticMediaDownload'});
      attachClickEvent(resetButton, () => {
        confirmationPopup({
          titleLangKey: 'ResetAutomaticMediaDownloadAlertTitle',
          descriptionLangKey: 'ResetAutomaticMediaDownloadAlert',
          button: {
            langKey: 'Reset'
          }
        }).then(() => {
          rootScope.settings.autoDownloadNew = copy(STATE_INIT.settings.autoDownloadNew);
          rootScope.settings.autoDownload = copy(STATE_INIT.settings.autoDownload);
          appStateManager.pushToState('settings', rootScope.settings);
          rootScope.dispatchEvent('settings_updated', {key: 'settings', value: rootScope.settings});

          setSubtitles();
          autoCheckboxField.checked = !state.settings.autoDownloadNew.pFlags.disabled;
        });
      });

      const onDisabledChange = () => {
        const disabled = !autoCheckboxField.checked;

        const settings = rootScope.settings;
        if(disabled) {
          settings.autoDownloadNew.pFlags.disabled = true;
        } else {
          delete settings.autoDownloadNew.pFlags.disabled;
        }

        [photoRow, videoRow, fileRow].forEach(row => {
          row.container.classList.toggle('is-disabled', disabled);
        });
        
        appStateManager.pushToState('settings', settings);
        rootScope.dispatchEvent('settings_updated', {key: 'settings', value: settings});

        onChange();
      };

      autoCheckboxField.input.addEventListener('change', onDisabledChange);
      onDisabledChange();
      setSubtitles();

      section.content.append(
        autoCheckboxField.label,
        photoRow.container,
        videoRow.container,
        fileRow.container,
        resetButton
      );
      
      this.scrollable.append(section.container);
    }

    {
      const section = new SettingSection({name: 'AutoplayMedia'});

      const gifsCheckboxField = new CheckboxField({
        text: 'AutoplayGIF', 
        name: 'gifs', 
        stateKey: 'settings.autoPlay.gifs',
        withRipple: true
      });
      const videosCheckboxField = new CheckboxField({
        text: 'AutoplayVideo', 
        name: 'videos', 
        stateKey: 'settings.autoPlay.videos',
        withRipple: true
      });

      section.content.append(gifsCheckboxField.label, videosCheckboxField.label);

      this.scrollable.append(section.container);
    }
  }

  private setAutoDownloadSubtitle(row: Row, settings: AutoDownloadPeerTypeSettings, sizeMax?: number) {
    let key: LangPackKey, args: FormatterArguments = [];
    
    const peerKeys = Object.keys(settings) as (keyof typeof AUTO_DOWNLOAD_FOR_KEYS)[];
    const enabledKeys = peerKeys.map(key => settings[key] ? AUTO_DOWNLOAD_FOR_KEYS[key] : undefined).filter(Boolean);
    if(!enabledKeys.length || sizeMax === 0) {
      key = 'AutoDownloadOff';
    } else {
      const isAll = enabledKeys.length === peerKeys.length;
      if(sizeMax !== undefined) {
        key = isAll ? 'AutoDownloadUpToOnAllChats' : 'AutoDownloadOnUpToFor';
        args.push(formatBytes(sizeMax));
      } else {
        key = isAll ? 'AutoDownloadOnAllChats' : 'AutoDownloadOnFor';
      }
  
      if(!isAll) {
        const fragment = document.createElement('span');
        fragment.append(...join(enabledKeys.map(key => i18n(key)), true, false));
        args.push(fragment);
      }
    }
    
    replaceContent(row.subtitle, i18n(key, args));
  }
}
