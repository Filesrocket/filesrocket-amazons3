import { ServiceMethods, Paginated, FileEntity, ResultEntity, Query } from "filesrocket";
import { GenerateFilename, Service } from "filesrocket/lib/common";
import { NotFound } from "filesrocket/lib/errors";
import { omitProps } from "filesrocket/lib/utils";

import { AmazonConfig } from "../declarations";
import { BaseAmazonRocket } from "../base";

@Service({
  type: "Files",
  name: "s3"
})
export class FileService extends BaseAmazonRocket implements ServiceMethods {
  constructor(options: AmazonConfig) {
    super(options);
    this.createBucket(options.Bucket)
      .then(() => console.log("Your bucket was create successfully."))
      .catch(() => console.error("Your bucket already exist."));
  }

  @GenerateFilename()
  async create(data: FileEntity, query: Query): Promise<ResultEntity> {
    const partialQuery = omitProps(query, ["path"]);

    const file = await this.s3.upload({
      ...partialQuery,
      Bucket: query.Bucket || this.options.Bucket,
      Key: query.path ? `${query.path}/${data.name}` : data.name,
      Body: data.stream
    }).promise();

    return this.builder(file, { Bucket: file.Bucket, Key: file.Key });
  }

  async list(query: Query): Promise<Paginated<ResultEntity>> {
    const partialQuery = omitProps(query, ["path", "size", "page", "prevPage"]);
    const { Pagination } = this.options;

    const paginate: number = query.size <= Pagination.max
      ? query.size
      : Pagination.default;

    const data = await this.s3.listObjectsV2({
      ...partialQuery,
      Bucket: query.Bucket || this.options.Bucket,
      MaxKeys: paginate,
      Prefix: query.path,
      ContinuationToken: query.page,
      StartAfter: query.prevPage || ''
    }).promise();

    data.Contents = data.Contents?.map(item =>
      this.builder(item, {
        Bucket: query.Bucket || this.options.Bucket,
        Key: item.Key
      }) as any
    );

    return this.paginate(data);
  }

  async remove(path: string, query: Query): Promise<ResultEntity> {
    const data = await this.list({ path });
    if (!data.items.length) {
      throw new NotFound("The file does not exist.");
    }

    const partialQuery = omitProps(query, ["path", "size", "page", "id"]);
    const file = data.items[0];

    await this.s3.deleteObject({
      ...partialQuery,
      Bucket: query.Bucket || this.options.Bucket,
      Key: file.Key
    }).promise();

    return file;
  }
}
