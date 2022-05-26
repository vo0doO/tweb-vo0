/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

type TargetType = HTMLElement;
export type OnVisibilityChange = (target: TargetType, visible: boolean) => void;

export default class VisibilityIntersector {
  private observer: IntersectionObserver;
  private items: Map<TargetType, boolean> = new Map();
  private locked = false;

  constructor(onVisibilityChange: OnVisibilityChange) {
    this.observer = new IntersectionObserver((entries) => {
      if(this.locked) {
        return;
      }

      const changed: {target: TargetType, visible: boolean}[] = [];

      entries.forEach(entry => {
        const target = entry.target as TargetType;

        if(this.items.get(target) === entry.isIntersecting) {
          return;
        } else {
          this.items.set(target, entry.isIntersecting);
        }

        /* if(entry.isIntersecting) {
          console.log('ooo', entry);
        } */

        /* if(this.locked) {
          return;
        } */

        changed[entry.isIntersecting ? 'unshift' : 'push']({target, visible: entry.isIntersecting});

        //onVisibilityChange(target, entry.isIntersecting);
      });

      changed.forEach(smth => {
        onVisibilityChange(smth.target, smth.visible);
      });
    });
  }

  public getVisible() {
    const items: TargetType[] = [];
    this.items.forEach((value, key) => {
      if(value) {
        items.push(key);
      }
    });

    return items;
  }

  public clearVisible() {
    const visible = this.getVisible();
    for(const target of visible) {
      this.items.set(target, false);
    }
  }

  public isVisible(target: TargetType) {
    return this.items.get(target);
  }

  public disconnect() {
    this.observer.disconnect();
    this.items.clear();
  }

  public refresh() {
    this.observer.disconnect();

    //window.requestAnimationFrame(() => {
      const targets = [...this.items.keys()];
      for(const target of targets) {
        //this.items.set(target, false);
        this.observer.observe(target);
      }
    //});
  }

  public refreshVisible() {
    const visible = this.getVisible();
    for(const target of visible) {
      this.observer.unobserve(target);
    }

    for(const target of visible) {
      this.observer.observe(target);
    }
  }

  public observe(target: TargetType) {
    this.items.set(target, false);
    this.observer.observe(target);
  }

  public unobserve(target: TargetType) {
    this.observer.unobserve(target);
    this.items.delete(target);
  }

  public unlock() {
    this.locked = false;
  }

  public unlockAndRefresh() {
    this.unlock();
    this.refresh();
  }

  public lock() {
    this.locked = true;
  }
}
