import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { EditorPage } from './editor.page';

const post = {
  id: 1, slug: 'hello', title: 'Hello', excerpt: '', status: 'published' as const,
  author: { username: 'a', displayName: 'A' },
  createdAt: '', updatedAt: '', publishedAt: '', body: 'text', html: '<p>text</p>',
};

describe('EditorPage', () => {
  let api: jasmine.SpyObj<ApiService>;
  beforeEach(() => {
    api = jasmine.createSpyObj('ApiService', ['getPost', 'createPost', 'updatePost', 'deletePost']);
    TestBed.configureTestingModule({
      imports: [EditorPage],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { isOwner: (u: string) => u === 'a' } },
      ],
    });
    spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
  });

  it('create sends trimmed payload', () => {
    api.createPost.and.returnValue(of({ ...post, status: 'draft' as const }));
    const f = TestBed.createComponent(EditorPage);
    f.detectChanges();
    f.componentInstance.form.setValue({ title: '  Hi  ', body: 'b', status: 'draft' });
    f.componentInstance.save();
    expect(api.createPost).toHaveBeenCalledWith({ title: 'Hi', body: 'b', status: 'draft' });
  });

  it('edit prefills the form', () => {
    api.getPost.and.returnValue(of(post));
    const f = TestBed.createComponent(EditorPage);
    f.componentRef.setInput('slug', 'hello');
    f.detectChanges();
    expect(f.componentInstance.form.getRawValue()).toEqual({ title: 'Hello', body: 'text', status: 'published' });
  });
});
