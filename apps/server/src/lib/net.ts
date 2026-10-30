import { setDefaultResultOrder } from 'node:dns';

/**
 * 这台机器的 IPv6 出不去，而源站大量走 Cloudflare（同时有 AAAA 记录），
 * Node 默认会优先尝试 IPv6 然后一直挂到超时，表现为 fetch 莫名的 ECONNRESET / 超时。
 * 统一改成 IPv4 优先，curl 一直是这个行为所以没出过问题。
 */
setDefaultResultOrder('ipv4first');
