/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { SettingSection } from "../..";
import { LangPackKey } from "../../../../lib/langPack";
import CheckboxField from "../../../checkboxField";
import { SliderSuperTabEventable } from "../../../sliderTab";

export function autoDownloadPeerTypeSection(type: 'photo' | 'video' | 'file', title: LangPackKey) {
  const section = new SettingSection({name: title});

  const key = 'settings.autoDownload.' + type + '.';
  const contactsCheckboxField = new CheckboxField({
    text: 'AutodownloadContacts', 
    name: 'contacts',
    stateKey: key + 'contacts',
    withRipple: true
  });
  const privateCheckboxField = new CheckboxField({
    text: 'AutodownloadPrivateChats', 
    name: 'private',
    stateKey: key + 'private',
    withRipple: true
  });
  const groupsCheckboxField = new CheckboxField({
    text: 'AutodownloadGroupChats', 
    name: 'groups',
    stateKey: key + 'groups',
    withRipple: true
  });
  const channelsCheckboxField = new CheckboxField({
    text: 'AutodownloadChannels', 
    name: 'channels',
    stateKey: key + 'channels',
    withRipple: true
  });

  section.content.append(
    contactsCheckboxField.label, 
    privateCheckboxField.label, 
    groupsCheckboxField.label, 
    channelsCheckboxField.label
  );

  return section;
}

export default class AppAutoDownloadPhotoTab extends SliderSuperTabEventable {
  protected init() {
    this.header.classList.add('with-border');
    this.setTitle('AutoDownloadPhotos');

    const section = autoDownloadPeerTypeSection('photo', 'AutoDownloadPhotosTitle');
    this.scrollable.append(section.container);
  }
}
