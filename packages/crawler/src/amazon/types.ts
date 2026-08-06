export interface AmazonVolumeItem {
  asin: string;
  title: string;
  cover: string;
}

export interface AmazonProductSerial {
  title?: string;
  total: string;
}

export interface AmazonProductSet {
  title: string;
  authors: string[];
  artists: string[];
  volumes: AmazonVolumeItem[];
}

export interface AmazonProductVolume {
  title: string;
  cover: string;
  coverHires: string;
  authors: string[];
  artists: string[];
  introduction: string;
  publisher?: string;
  publishAt?: number;
  r18: boolean;
  breadcrumbs: string;
  otherVersion: string[];
}

export type AmazonProduct =
  | {
      type: 'serial';
      serial: AmazonProductSerial;
    }
  | {
      type: 'set';
      set: AmazonProductSet;
    }
  | {
      type: 'volume';
      volume: AmazonProductVolume;
    };

export interface AmazonSerial {
  authors: string[];
  artists: string[];
  volumes: AmazonVolumeItem[];
}

export interface AmazonSearchItem extends AmazonVolumeItem {
  serialAsin?: string;
}
