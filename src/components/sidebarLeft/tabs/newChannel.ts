/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appSidebarLeft, { SettingSection } from "..";
import { InputFile } from "../../../layer";
import appChatsManager from "../../../lib/appManagers/appChatsManager";
import InputField from "../../inputField";
import { SliderSuperTab } from "../../slider";
import AvatarEdit from "../../avatarEdit";
import AppAddMembersTab from "./addMembers";
import { _i18n } from "../../../lib/langPack";
import ButtonCorner from "../../buttonCorner";

export default class AppNewChannelTab extends SliderSuperTab {
  private uploadAvatar: () => Promise<InputFile> = null;

  private channelNameInputField: InputField;
  private channelDescriptionInputField: InputField;
  private nextBtn: HTMLButtonElement;
  private avatarEdit: AvatarEdit;

  protected init() {
    this.container.classList.add('new-channel-container');
    this.setTitle('NewChannel');

    this.avatarEdit = new AvatarEdit((_upload) => {
      this.uploadAvatar = _upload;
    });

    const section = new SettingSection({
      caption: 'Channel.DescriptionHolderDescrpiton'
    });

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');

    this.channelNameInputField = new InputField({
      label: 'EnterChannelName',
      maxLength: 128
    });

    this.channelDescriptionInputField = new InputField({
      label: 'DescriptionOptionalPlaceholder',
      maxLength: 255
    });

    inputWrapper.append(this.channelNameInputField.container, this.channelDescriptionInputField.container);

    const onLengthChange = () => {
      this.nextBtn.classList.toggle('is-visible', !!this.channelNameInputField.value.length && 
        !this.channelNameInputField.input.classList.contains('error') && 
        !this.channelDescriptionInputField.input.classList.contains('error'));
    };

    this.channelNameInputField.input.addEventListener('input', onLengthChange);
    this.channelDescriptionInputField.input.addEventListener('input', onLengthChange);

    this.nextBtn = ButtonCorner({icon: 'arrow_next'});

    this.nextBtn.addEventListener('click', () => {
      const title = this.channelNameInputField.value;
      const about = this.channelDescriptionInputField.value;

      this.nextBtn.disabled = true;
      appChatsManager.createChannel({
        title, 
        about,
        broadcast: true
      }).then((channelId) => {
        if(this.uploadAvatar) {
          this.uploadAvatar().then((inputFile) => {
            appChatsManager.editPhoto(channelId, inputFile);
          });
        }
        
        appSidebarLeft.removeTabFromHistory(this);
        new AppAddMembersTab(this.slider).open({
          type: 'channel',
          skippable: true,
          title: 'GroupAddMembers',
          placeholder: 'SendMessageTo',
          takeOut: (peerIds) => {
            return appChatsManager.inviteToChannel(channelId, peerIds);
          }
        });
      });
    });

    this.content.append(this.nextBtn);
    section.content.append(this.avatarEdit.container, inputWrapper);
    this.scrollable.append(section.container);
  }

  public onCloseAfterTimeout() {
    this.avatarEdit.clear();
    this.uploadAvatar = null;
    this.channelNameInputField.value = '';
    this.channelDescriptionInputField.value = '';
    this.nextBtn.disabled = false;
    return super.onCloseAfterTimeout();
  }
}
