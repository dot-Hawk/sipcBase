import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveBlob } from './download';

afterEach(() => vi.restoreAllMocks());

describe('saveBlob', () => {
  it('clicks a temporary link with the file name and releases the object URL', () => {
    const create = vi.fn(() => 'blob:fake');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const clicked: { download: string; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ download: this.download, href: this.href });
    });
    saveBlob(new Blob(['x']), 'resultados.csv');
    expect(clicked).toEqual([{ download: 'resultados.csv', href: 'blob:fake' }]);
    expect(revoke).toHaveBeenCalledWith('blob:fake');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
