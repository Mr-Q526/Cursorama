import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { ApertureIcon, ArrowUpRightIcon, CoffeeIcon, GithubLogoIcon, ChatCircleIcon, UserIcon, XIcon } from '@phosphor-icons/react';
import { ABOUT_LINKS, type AboutLink } from '../../shared';
import { t } from '../i18n';
import { UpdateSettings, type UpdateSettingsProps } from './UpdateSettings';

export type AboutSettingsProps = UpdateSettingsProps;

const COMMUNITY_LINKS = [
  { id: 'author', icon: UserIcon },
  { id: 'repository', icon: GithubLogoIcon },
] as const;
const PAYMENT_METHODS = ['wechat', 'alipay'] as const;
const COMMUNITY_DESCRIPTIONS = { author: 'authorName', repository: 'repositoryName', feedback: 'feedbackHint' } as const;

export function AboutSettings(props: AboutSettingsProps) {
  const copy = t.about;
  const [supportOpen, setSupportOpen] = useState(false);
  const [linkFailed, setLinkFailed] = useState(false);
  const support = useRef<HTMLElement>(null);
  const supportButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (supportOpen) { support.current?.focus({ preventScroll: true }); support.current?.scrollIntoView({ block: 'start' }); }
  }, [supportOpen]);
  const openLink = (event: MouseEvent<HTMLAnchorElement>, target: AboutLink): void => {
    if (!window.desktop) return;
    event.preventDefault();
    setLinkFailed(false);
    void window.desktop.openAboutLink(target).catch((error: unknown) => { console.error('ABOUT_LINK_FAILED', error); setLinkFailed(true); });
  };
  return <div className="about-settings">
    <header className="about-identity"><span className="about-app-icon" aria-hidden="true"><ApertureIcon size={30} weight="duotone" /></span><h2>{t.editor.appName}</h2><p>{copy.tagline}</p></header>
    <UpdateSettings {...props} />
    <div className="about-links">
      {COMMUNITY_LINKS.map(({ id, icon: Glyph }) => <a key={id} className="about-link-card" data-about-link={id} href={ABOUT_LINKS[id]} target="_blank" rel="noreferrer" onClick={(event) => openLink(event, id)}><Glyph size={19} aria-hidden="true" /><span><strong>{copy[id]}</strong><small>{copy[COMMUNITY_DESCRIPTIONS[id]]}</small></span><ArrowUpRightIcon size={13} aria-hidden="true" /></a>)}
      <button ref={supportButton} type="button" className="about-link-card" data-action="show-support" aria-expanded={supportOpen} aria-controls="about-support" onClick={() => setSupportOpen((current) => !current)}><CoffeeIcon size={20} aria-hidden="true" /><span><strong>{copy.support}</strong><small>{copy.supportHint}</small></span></button>
      <a className="about-link-card" data-about-link="feedback" href={ABOUT_LINKS.feedback} target="_blank" rel="noreferrer" onClick={(event) => openLink(event, 'feedback')}><ChatCircleIcon size={19} aria-hidden="true" /><span><strong>{copy.feedback}</strong><small>{copy.feedbackHint}</small></span><ArrowUpRightIcon size={13} aria-hidden="true" /></a>
    </div>
    {linkFailed && <p className="error-message" role="alert">{copy.linkFailed}</p>}
    {supportOpen && <section ref={support} id="about-support" className="about-support" aria-labelledby="about-support-heading" tabIndex={-1}>
      <div className="about-support-heading"><h3 id="about-support-heading"><CoffeeIcon size={19} aria-hidden="true" />{copy.support}</h3><button type="button" className="icon-button" aria-label={copy.closeSupport} onClick={() => { setSupportOpen(false); supportButton.current?.focus(); }}><XIcon size={16} /></button></div>
      <p>{copy.coffeeIntro}</p>
      <div className="support-payments">{PAYMENT_METHODS.map((method) => <figure className="support-payment" key={method}>
        <div className={`support-code support-code-${method}`}><img src={`${import.meta.env.BASE_URL}support/${method}.jpg`} alt={copy[`${method}Code`]} /></div>
        <figcaption><strong>{copy[method]}</strong><span>{copy.scanHint}</span></figcaption>
      </figure>)}</div>
      <p className="support-thanks">{copy.coffeeThanks}</p>
    </section>}
  </div>;
}
