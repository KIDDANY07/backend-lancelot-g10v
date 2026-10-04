import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { extractErrorMessage } from 'src/common/utils/error-message.util'
import {
  SEASON_CLOSED_EVENT,
  type SeasonClosedEvent,
} from 'src/seasons/seasons.service'
import { TalentDetectionService } from './talent-detection.service'

@Injectable()
export class TalentDetectionListener {
  private readonly logger = new Logger(TalentDetectionListener.name)

  constructor(
    private readonly talentDetectionService: TalentDetectionService,
  ) {}

  @OnEvent(SEASON_CLOSED_EVENT, { async: true })
  async handleSeasonClosed(event: SeasonClosedEvent) {
    try {
      await this.talentDetectionService.detectForSeason(event.id_season)
    } catch (error) {
      this.logger.error(
        `Error en la detección automática de talento al cerrar la temporada ${event.id_season}: ${extractErrorMessage(error)}`,
      )
    }
  }
}
