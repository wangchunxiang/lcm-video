import { describe, expect, it } from 'vitest';
import { isMobileRequest } from './mobile.ts';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  androidPhone:
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
  androidTablet:
    'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
};

describe('isMobileRequest', () => {
  it('Sec-CH-UA-Mobile 提示优先', () => {
    expect(isMobileRequest({ 'sec-ch-ua-mobile': '?1' })).toBe(true);
    expect(isMobileRequest({ 'sec-ch-ua-mobile': '?1', 'user-agent': UA.windows })).toBe(true);
  });

  it('手机 UA 判为移动端', () => {
    expect(isMobileRequest({ 'user-agent': UA.iphone })).toBe(true);
    expect(isMobileRequest({ 'user-agent': UA.androidPhone })).toBe(true);
  });

  it('平板与桌面判为非移动端', () => {
    expect(isMobileRequest({ 'user-agent': UA.ipad })).toBe(false);
    expect(isMobileRequest({ 'user-agent': UA.androidTablet })).toBe(false);
    expect(isMobileRequest({ 'user-agent': UA.windows })).toBe(false);
  });

  it('缺少 UA 时按桌面处理', () => {
    expect(isMobileRequest({})).toBe(false);
  });
});
