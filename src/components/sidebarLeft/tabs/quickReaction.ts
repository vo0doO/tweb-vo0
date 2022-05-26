/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { SettingSection } from "..";
import appReactionsManager from "../../../lib/appManagers/appReactionsManager";
import RadioField from "../../radioField";
import Row, { RadioFormFromRows } from "../../row";
import SliderSuperTab from "../../sliderTab";
import { wrapStickerToRow } from "../../wrappers";

export default class AppQuickReactionTab extends SliderSuperTab {
  protected init() {
    this.header.classList.add('with-border');
    this.setTitle('DoubleTapSetting');
    this.container.classList.add('quick-reaction-container');

    return Promise.all([
      appReactionsManager.getQuickReaction(),
      appReactionsManager.getAvailableReactions()
    ]).then(([quickReaction, availableReactions]) => {
      availableReactions = availableReactions.filter(reaction => !reaction.pFlags.inactive);

      const section = new SettingSection();

      const name = 'quick-reaction';
      const rows = availableReactions.map((availableReaction) => {
        const radioField = new RadioField({
          name,
          text: availableReaction.title,
          value: availableReaction.reaction,
          alignRight: true
        });

        const row = new Row({
          radioField,
          havePadding: true
        });

        radioField.main.classList.add('quick-reaction-title');

        wrapStickerToRow({
          row,
          doc: availableReaction.static_icon,
          size: 'small'
        });

        if(availableReaction === quickReaction) {
          radioField.setValueSilently(true);
        }

        return row;
      });

      const form = RadioFormFromRows(rows, (value) => {
        appReactionsManager.setDefaultReaction(value);
      });

      section.content.append(form);
      this.scrollable.append(section.container);
    });
  }
}
