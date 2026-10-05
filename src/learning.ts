import {invoke} from '@tauri-apps/api/core';
import {track} from './ai';
import type {Language} from './i18n';
export interface LearningSeed {word:string;answer:string;example:string;dateKey:string;language:Language;sourceKind:'note'|'suggestion'}
export interface LearningDraft extends LearningSeed {definition:string}
export interface LearningCard {id:string;language:Language;word:string;definition:string;example:string;answer:string;sourceDate:string;sourceKind:'note'|'suggestion';dueAt:number;intervalSeconds:number;reviews:number}
export type Rating='again'|'hard'|'good'|'easy';
export const learningList=(language:Language)=>invoke<LearningCard[]>('learning_list',{language});
export const learningAdd=(draft:LearningDraft)=>track(invoke<{card:LearningCard;created:boolean}>('learning_add',{draft}));
export const learningReview=(card:LearningCard,rating:Rating,reviewId:string)=>track(invoke<LearningCard>('learning_review',{cardId:card.id,rating,expectedReviews:card.reviews,reviewId}));
export const learningDefinition=(word:string,example:string,language:Language)=>track(invoke<{word:string;definition:string}>('ai_learning_definition',{word,example,language}));
