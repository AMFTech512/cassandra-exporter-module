export declare function importToDB({
  HOST = '127.0.0.1',
  PORT = 9042,
  KEYSPACE,
  USER,
  PASSWORD,
  DIRECTORY = './data',
  USE_SSL
}: {
  HOST?: string;
  PORT?: number;
  KEYSPACE: string;
  USER?: string;
  PASSWORD?: string;
  DIRECTORY?: string;
  USE_SSL?: boolean;
}): Promise<void>;

export declare function exportFromDB({
  HOST = '127.0.0.1',
  PORT = 9042,
  KEYSPACE,
  USER,
  PASSWORD,
  DIRECTORY = './data',
  USE_SSL,
}: {
  HOST?: string;
  PORT?: number;
  KEYSPACE: string;
  USER?: string;
  PASSWORD?: string;
  DIRECTORY?: string;
  USE_SSL?: boolean;
}): Promise<void>;