import { IsOptional, IsString, ValidateBy } from 'class-validator';

const DATA_IMAGE_URL_RE = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;

function IsHttpOrDataImageUrl() {
  return ValidateBy({
    name: 'isHttpOrDataImageUrl',
    validator: {
      validate(value: unknown) {
        if (typeof value !== 'string') return false;
        if (DATA_IMAGE_URL_RE.test(value)) return true;

        try {
          const url = new URL(value);
          return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
          return false;
        }
      },
      defaultMessage() {
        return 'image_url must be an http(s) URL or a base64 data:image URL';
      },
    },
  });
}

export class ImageEditBodyDto {
  @IsString() @IsHttpOrDataImageUrl() image_url: string;
  @IsString() preset: string;
  @IsString() @IsOptional() user_prompt?: string;
}
